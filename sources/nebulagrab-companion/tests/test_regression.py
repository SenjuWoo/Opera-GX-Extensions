"""Regression tests use temporary config/output/cache and local HTTP fixtures only."""
import importlib.util
import json
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock


DATA = b"0123456789"


class MediaHandler(BaseHTTPRequestHandler):
    received = []
    redirect_origin = ""

    def log_message(self, *_args):
        pass

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Length", str(len(DATA)))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

    def do_GET(self):
        if self.path in {"/redirect", "/same"}:
            self.send_response(302)
            target = self.redirect_origin + "/target" if self.path == "/redirect" else "/target"
            self.send_header("Location", target)
            self.end_headers()
            return
        self.received.append((self.path, dict(self.headers)))
        body = DATA
        range_value = self.headers.get("Range")
        if range_value:
            start, end = range_value.removeprefix("bytes=").split("-", 1)
            start, end = int(start), int(end) if end else len(DATA) - 1
            if self.path == "/bad-resume":
                start = 0
            body = DATA[start:end + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(DATA)}")
        else:
            self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class CompanionRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="nebulagrab-tests-", dir=Path(__file__).resolve().parent)
        cls.root = Path(cls.temp.name)
        source = Path(__file__).resolve().parents[1] / "server.py"
        shutil.copy2(source, cls.root / "server.py")
        config = {"token": "test-only-placeholder", "output_dir": str(cls.root / "output"),
                  "cache_dir": str(cls.root / "cache"), "direct_retries": 1, "stream_retries": 1}
        (cls.root / "config.json").write_text(json.dumps(config), encoding="utf-8")
        spec = importlib.util.spec_from_file_location("nebulagrab_test_server", cls.root / "server.py")
        cls.module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cls.module
        spec.loader.exec_module(cls.module)
        cls.module.ALLOW_PRIVATE = True
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), MediaHandler)
        cls.other = ThreadingHTTPServer(("127.0.0.1", 0), MediaHandler)
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"
        MediaHandler.redirect_origin = f"http://127.0.0.1:{cls.other.server_port}"
        cls.threads = [threading.Thread(target=item.serve_forever, daemon=True) for item in (cls.http, cls.other)]
        for thread in cls.threads:
            thread.start()

    @classmethod
    def tearDownClass(cls):
        for item in (cls.http, cls.other):
            item.shutdown()
            item.server_close()
        for thread in cls.threads:
            thread.join(timeout=2)
        sys.modules.pop("nebulagrab_test_server", None)
        cls.temp.cleanup()

    def setUp(self):
        self.module.JOBS.clear()
        MediaHandler.received.clear()

    def test_content_query_parameters_separate_cache(self):
        identity = self.module.stable_url_identity
        self.assertNotEqual(identity(self.base + "/file?id=1"), identity(self.base + "/file?id=2"))
        self.assertEqual(identity(self.base + "/file?id=1&token=old&expires=1"),
                         identity(self.base + "/file?id=1&token=new&expires=2"))

    def test_configuration_error_preserves_original_bytes(self):
        for content in (b"{broken", b"[]"):
            config = self.root / "broken-config.json"
            config.write_bytes(content)
            with self.subTest(content=content), mock.patch.object(self.module, "CONFIG_PATH", config):
                with self.assertRaises(RuntimeError):
                    self.module.load_config()
                self.assertEqual(config.read_bytes(), content)

    def test_cross_origin_redirect_drops_credentials(self):
        with self.module.open_remote(self.base + "/redirect", {"Cookie": "test-only", "Authorization": "test-only"}) as response:
            self.assertEqual(response.read(), DATA)
        headers = MediaHandler.received[-1][1]
        self.assertNotIn("Cookie", headers)
        self.assertNotIn("Authorization", headers)

    def test_same_origin_redirect_preserves_credentials(self):
        with self.module.open_remote(self.base + "/same", {"Cookie": "test-only", "Authorization": "test-only"}) as response:
            response.read()
        headers = MediaHandler.received[-1][1]
        self.assertEqual(headers.get("Cookie"), "test-only")
        self.assertEqual(headers.get("Authorization"), "test-only")

    def test_whole_download_ignores_browser_preview_range(self):
        root = self.root / "direct"
        output = self.root / "whole.bin"
        job = self.module.Job(id="direct", url=self.base + "/file", output=str(output))
        self.module.JOBS[job.id] = job
        self.module.run_direct(job.id, {"url": job.url, "headers": {"Range": "bytes=4-7"}, "_cache_root": str(root)})
        self.assertEqual(job.status, "completed", job.error)
        self.assertEqual(output.read_bytes(), DATA)
        self.assertNotIn("Range", MediaHandler.received[-1][1])

    def test_bad_resume_range_cannot_corrupt_or_publish_output(self):
        root = self.root / "resume"
        root.mkdir(exist_ok=True)
        partial = root / "payload.partial"
        partial.write_bytes(DATA[:5])
        output = self.root / "bad-resume.bin"
        with self.assertRaisesRegex(RuntimeError, "invalid Content-Range"):
            self.module.run_sequential_direct("missing", self.base + "/bad-resume", {}, output, {"total": len(DATA)}, root)
        self.assertEqual(partial.read_bytes(), DATA[:5])
        self.assertFalse(output.exists())

    def test_content_range_syntax_and_bounds(self):
        parse = self.module.parse_content_range
        self.assertEqual(parse("bytes 5-9/10"), (5, 9, 10))
        for invalid in ("bytes 9-5/10", "bytes 0-10/10", "bytes 0-9/10 junk", "bytes 0-0/0"):
            with self.subTest(invalid=invalid):
                self.assertIsNone(parse(invalid))

    def test_active_job_filenames_are_reserved(self):
        payload = {"kind": "video", "title": "same-name", "url": self.base + "/one.mp4"}
        with mock.patch.object(self.module.threading.Thread, "start"):
            first = self.module.start_job(payload)
            second = self.module.start_job({**payload, "url": self.base + "/two.mp4"})
        self.assertNotEqual(first.output, second.output)
        self.assertIn("(2)", second.output)

    def test_enormous_sequence_gaps_are_bounded(self):
        with self.assertRaisesRegex(RuntimeError, "missing sequence numbers: 2, 3") as caught:
            self.module.validate_segment_continuity([{"sequence": 1, "init": False}, {"sequence": 10**14, "init": False}])
        self.assertLess(len(str(caught.exception)), 400)

    def test_invalid_fragment_job_becomes_failed(self):
        root = self.root / "fragments"
        job = self.module.Job(id="fragments", url=self.base + "/seg-1.m4s", output=str(self.root / "fragment.mkv"))
        self.module.JOBS[job.id] = job
        with mock.patch.object(self.module, "ffmpeg_executable", return_value="ffmpeg"):
            self.module.run_captured_segments(job.id, {"url": job.url, "segmentsTruncated": True, "_cache_root": str(root)})
        self.assertEqual(job.status, "failed")
        self.assertIn("fragment limit", job.error)

    def test_fragment_bad_range_preserves_cache(self):
        destination = self.root / "bad-fragment.m4s"
        partial = destination.with_suffix(".m4s.partial")
        partial.write_bytes(DATA[:5])
        entry = {"url": self.base + "/bad-resume", "headers": {}, "range": "bytes=0-9", "size": 10}
        with self.assertRaisesRegex(RuntimeError, "does not match"):
            self.module.download_captured_fragment("missing", entry, destination, {"done": 0, "bytes": 0, "total": 1}, threading.Lock())
        self.assertEqual(partial.read_bytes(), DATA[:5])
        self.assertFalse(destination.exists())

    def test_oversized_plain_fragment_cache_restarts_cleanly(self):
        destination = self.root / "oversized-fragment.m4s"
        partial = destination.with_suffix(".m4s.partial")
        partial.write_bytes(DATA + b"stale")
        entry = {"url": self.base + "/file", "headers": {}, "size": len(DATA)}
        self.module.download_captured_fragment("missing", entry, destination,
                                               {"done": 0, "bytes": 0, "total": 1}, threading.Lock())
        self.assertEqual(destination.read_bytes(), DATA)
        self.assertNotIn("Range", MediaHandler.received[-1][1])

    def test_remote_url_is_reconstructed_before_request(self):
        url = "HTTPS://BÜCHER.example:443/path?q=1#not-sent"
        expected = "https://xn--bcher-kva.example:443/path?q=1"
        response = mock.Mock()
        response.geturl.return_value = expected
        with mock.patch.object(self.module.OPENER, "open", return_value=response) as opened:
            self.assertIs(self.module.open_remote(url, {}), response)
        self.assertEqual(opened.call_args.args[0].full_url, expected)
        self.assertEqual(self.module.reconstruct_remote_url("http://[::1]:8080/media#part"),
                         "http://[::1]:8080/media")
        for invalid in ("file:///media", "https://user:password@example.test/a", "https://example.test:bad/a"):
            with self.subTest(url=invalid), self.assertRaises(ValueError):
                self.module.reconstruct_remote_url(invalid)

    def test_non_global_remote_addresses_are_rejected(self):
        def address_result(address):
            return [(self.module.socket.AF_INET, self.module.socket.SOCK_STREAM, 6, "", (address, 443))]
        with mock.patch.object(self.module, "ALLOW_PRIVATE", False):
            for address in ("127.0.0.1", "10.0.0.1", "169.254.1.1", "100.64.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "0.0.0.0"):
                with self.subTest(address=address), mock.patch.object(self.module.socket, "getaddrinfo", return_value=address_result(address)):
                    with self.assertRaisesRegex(ValueError, "blocked by default"):
                        self.module.validate_remote_url("https://media.example/a")
            with mock.patch.object(self.module.socket, "getaddrinfo", return_value=address_result("8.8.8.8")):
                self.assertEqual(self.module.validate_remote_url("HTTPS://media.example/a#fragment"),
                                 "https://media.example/a")
            with mock.patch.object(self.module.socket, "getaddrinfo", return_value=[]):
                with self.assertRaisesRegex(ValueError, "Could not resolve"):
                    self.module.validate_remote_url("https://media.example/a")

    def test_redirect_uses_canonical_url_and_removes_credentials(self):
        request = self.module.urllib.request.Request("https://source.example/media", headers={"Cookie": "test-only", "Authorization": "test-only"})
        redirected = self.module.SafeRedirectHandler().redirect_request(
            request, None, 302, "Found", {}, "HTTPS://BÜCHER.example/media#fragment")
        self.assertEqual(redirected.full_url, "https://xn--bcher-kva.example/media")
        self.assertFalse(any(key.lower() in self.module.SENSITIVE_HEADERS for key in redirected.headers))

    def test_request_and_response_headers_reject_line_breaks(self):
        headers = self.module.safe_request_headers({}, "https://example.test/path\r\nInjected: value")
        self.assertNotIn("\r", headers["Referer"])
        self.assertNotIn("\n", headers["Referer"])
        self.assertFalse(self.module.is_extension_origin("chrome-extension://fixture\r\nInjected: value"))
        handler = self.module.Handler.__new__(self.module.Handler)
        with mock.patch.object(self.module.BaseHTTPRequestHandler, "send_header") as sent:
            handler.send_header("X-Test\r\n", "value\r\nInjected: value")
        self.assertEqual(sent.call_args.args, ("X-Test", "valueInjected: value"))


if __name__ == "__main__":
    unittest.main()
