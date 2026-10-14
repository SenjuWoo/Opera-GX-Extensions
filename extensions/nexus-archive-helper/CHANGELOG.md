# Changelog

## 1.1.3 - 2026-10-13

- Keep older, slower lookups from replacing the newest results or errors in the extension and userscript.
- Use NXM authorization keys only for the exact file they authorize.
- Apply the official API origin and redirect protection to the Tampermonkey userscript too.
- Enforce a real 30-second abort deadline for Tampermonkey's fetch transport.
- Open authorized downloads through Tampermonkey's tab API, avoiding popup blocking after slow authorization.

## 1.1.2 - 2026-10-12

- Keep extension API-key storage restricted to trusted extension contexts; page integrations can only scan their own Nexus page and open the helper.
- Keep the userscript API key out of page DOM by using a native setup prompt and Tampermonkey menu command in its DOM sandbox.
- Enforce the official HTTPS API origin, reject redirects when sending API keys, and time out API requests after 30 seconds.
- Reject unsafe download URI schemes and embedded credentials.
- Download from the reference associated with displayed results when the input has since been edited.
- Add regression tests and opt-in worker diagnostics.
