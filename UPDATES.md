# KopiPow updates

KopiPow supports two update paths. Both use the `preview` EAS channel while the app is still in development.

## 1. Expo over-the-air update

Use this for JavaScript or TypeScript, styling, copy, and bundled image changes that do not add or change native modules, Android permissions, Expo plugins, the Expo SDK, or native configuration.

Before publishing:

```powershell
pnpm run typecheck
pnpm exec expo export --platform android
```

Publish the update:

```powershell
pnpm dlx eas-cli@latest update --channel preview --message "Describe the change" --environment preview
```

Installed builds check when they launch or return to the foreground. If an update is available, the app offers **Update now** or **Later**. Update checks and restarts are postponed during checkout, Midtrans payment, cart synchronization, and pull-to-refresh.

## 2. Full Android APK update

Use this when changing native dependencies, permissions, Expo plugins, Expo SDK versions, icons, splash configuration, or any other native setting.

1. Increase both values in `app.json`:
   - `expo.version`, for example `1.1.0` to `1.2.0`.
   - `expo.android.versionCode`, for example `2` to `3`.
2. Build the signed APK with the same Expo project and EAS signing key:

```powershell
pnpm dlx eas-cli@latest build --platform android --profile preview
```

3. Upload the APK to a permanent HTTPS address. Do not use an expiring internal-build artifact URL for a long-lived release record.
4. In Supabase SQL Editor, publish the release:

```sql
insert into public.app_releases (
  platform,
  version_name,
  version_code,
  apk_url,
  release_notes,
  is_mandatory
)
values (
  'android',
  '1.2.0',
  3,
  'https://your-permanent-host.example/kopipow-1.2.0.apk',
  'Describe the improvements in this release.',
  false
)
on conflict (platform, version_code) do update set
  version_name = excluded.version_name,
  apk_url = excluded.apk_url,
  release_notes = excluded.release_notes,
  is_mandatory = excluded.is_mandatory,
  is_active = true,
  published_at = now();
```

Set `is_mandatory` to `true` only for a security or compatibility release that users must install. Android always displays its own signed-package installation confirmation; a regular standalone app cannot bypass it.

## First updater-enabled installation

The older `1.0.0` APK does not contain the updater. Build and manually install version `1.1.0` (`versionCode` 2) once. From that build onward, compatible Expo updates and future full-APK prompts work from inside KopiPow.

Keep the EAS Android signing key safe and unchanged. Android will reject an update APK signed with a different key.
