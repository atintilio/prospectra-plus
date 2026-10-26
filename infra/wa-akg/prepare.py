#!/usr/bin/env python3
"""Prepare the exact user-supplied AKG source; no network, install or production writes."""
import hashlib
import pathlib
import sys
import zipfile

EXPECTED = 'ee7861ed5b5cc59041479338646ef5d79bd276588767fe2a61f3ce94d65c098b'

def prepare(archive, destination):
    archive, destination = pathlib.Path(archive), pathlib.Path(destination)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != EXPECTED:
        raise ValueError('Archive differs from the reviewed WA-AKG source; review before preparing.')
    if destination.exists():
        raise ValueError('Destination already exists; preserve it and choose a fresh directory.')
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            path = pathlib.PurePosixPath(item.filename)
            if path.is_absolute() or '..' in path.parts or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe archive entry')
        destination.mkdir(parents=True)
        for item in bundle.infolist():
            parts = pathlib.PurePosixPath(item.filename).parts[1:]
            if not parts or item.is_dir():
                continue
            target = destination.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bundle.read(item))
    def patch(name, old, new):
        p = destination / name
        text = p.read_text()
        if text.count(old) != 1:
            raise ValueError('Patch precondition failed: ' + name)
        p.write_text(text.replace(old, new))
    patch('src/modules/whatsapp/manager.ts', 'enabled: true,', 'enabled: false,')
    patch('src/app/api/sessions/[sessionId]/bot-config/route.ts',
          'update: {\n                botMode: body.botMode,',
          'update: {\n                enabled: body.enabled,\n                botMode: body.botMode,')
    patch('src/app/api/sessions/[sessionId]/[action]/route.ts',
          '// Fallback DB update if instance not running',
          '// Clear stored credentials even when the browser/socket is not running.\n                    await prisma.authState.deleteMany({ where: { sessionId } });')
    # Return from logout only after persisted credentials have been removed.
    patch('src/app/api/sessions/[sessionId]/[action]/route.ts',
          'await instance.socket.logout();',
          'await instance.socket.logout();\n                    await prisma.authState.deleteMany({ where: { sessionId } });\n                    await prisma.session.update({ where: { sessionId }, data: { status: "LOGGED_OUT", qr: null } });')
    (destination / 'PROSPECTRA-PATCHES.md').write_text(
        '# Prospectra integration patches\nOriginal archive SHA256: ' + EXPECTED +
        '\nBot defaults off; bot config persists enabled; logout removes persisted credentials.\n'
        'MIT notices retained in LICENSE. No dependency or UI rebrand.\n')
    return destination

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 prepare.py WA-AKG-main.zip destination')
    print(prepare(sys.argv[1], sys.argv[2]))
