#!/usr/bin/env python3
"""Experimental LibreOffice Draw PDF text-object replacement.

This RECONSTRUCTS a new PDF via LibreOffice Draw. It does not edit original PDF
content streams and is NOT a general no-loss PDF text editor. Linux python3-uno
and LibreOffice Draw are required. Never wire this into production without
additional fidelity validation and a Windows UNO packaging strategy.
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    import uno
    from com.sun.star.beans import PropertyValue
except ImportError as exc:
    raise SystemExit("This experimental helper needs the system python3-uno package") from exc


def property_value(name, value):
    result = PropertyValue()
    result.Name = name
    result.Value = value
    return result


def connect(port, deadline):
    context = uno.getComponentContext()
    resolver = context.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", context
    )
    last_error = None
    while time.monotonic() < deadline:
        try:
            return resolver.resolve(
                "uno:socket,host=127.0.0.1,port=" + str(port) +
                ";urp;StarOffice.ComponentContext"
            )
        except Exception as exc:
            last_error = exc
            time.sleep(0.2)
    raise TimeoutError("Own isolated LibreOffice Draw engine did not start") from last_error


def run(source, dest, original, replacement, page=None):
    if source.suffix.lower() != ".pdf" or dest.suffix.lower() != ".pdf":
        raise ValueError("Only PDF input and PDF output are accepted")
    if not source.is_file() or not 0 < source.stat().st_size <= 12 * 1024 * 1024:
        raise ValueError("Input PDF missing or larger than 12MB")
    if dest.exists() or not dest.parent.is_dir() or source.resolve() == dest.resolve():
        raise ValueError("Output must be a new file in an existing directory; originals cannot be overwritten")
    if not original or original == replacement:
        raise ValueError("Provide a nonempty source string and a different replacement")
    if any(len(v) > 160 or any(c in v for c in "\r\n\x00") for v in (original, replacement)):
        raise ValueError("Text must be single-line and at most 160 characters each")
    with tempfile.TemporaryDirectory(prefix="wish-draw-pdf-probe-") as workspace:
        profile = Path(workspace) / "lo-profile"
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        binary = os.environ.get("LIBREOFFICE_BIN", "soffice")
        command = [
            binary,
            "-env:UserInstallation=" + profile.as_uri(),
            "--headless", "--nologo", "--nodefault", "--nofirststartwizard",
            "--accept=socket,host=127.0.0.1,port=" + str(port) + ";urp;StarOffice.ServiceManager",
        ]
        proc = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        doc = None
        try:
            context = connect(port, time.monotonic() + 16)
            manager = context.ServiceManager
            desktop = manager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
            doc = desktop.loadComponentFromURL(
                uno.systemPathToFileUrl(str(source.resolve())), "_blank", 0,
                (property_value("FilterName", "draw_pdf_import"),
                 property_value("Hidden", True), property_value("ReadOnly", False)),
            )
            if doc is None or not doc.supportsService("com.sun.star.drawing.DrawingDocument"):
                raise ValueError("PDF cannot be opened as editable Draw text objects")
            pages = doc.DrawPages.Count
            if not 0 < pages <= 30:
                raise ValueError("This experimental helper supports 1 to 30 PDF pages")
            matches = []
            shape_count = 0
            for index in range(pages):
                if page is not None and index + 1 != page:
                    continue
                draw_page = doc.DrawPages.getByIndex(index)
                for n in range(draw_page.Count):
                    shape_count += 1
                    if shape_count > 5000:
                        raise ValueError("Too many shapes for safe experimental editing")
                    shape = draw_page.getByIndex(n)
                    if not shape.supportsService("com.sun.star.drawing.TextShape"):
                        continue
                    text = shape.String or ""
                    count = text.count(original)
                    if count:
                        matches.append((index + 1, shape, text, count))
            if len(matches) != 1 or matches[0][3] != 1:
                raise ValueError(
                    "Expected exactly one complete editable text-object match; found " +
                    str(sum(m[3] for m in matches)) +
                    ". Scans, split glyphs, ambiguous matches and unsupported layouts are rejected"
                )
            target_page, target_shape, before, _ = matches[0]
            target_shape.String = before.replace(original, replacement, 1)
            doc.storeToURL(
                uno.systemPathToFileUrl(str(dest.resolve())),
                (property_value("FilterName", "draw_pdf_Export"),
                 property_value("Overwrite", False)),
            )
            if not dest.is_file() or dest.stat().st_size < 100:
                raise RuntimeError("Draw did not generate a usable PDF")
            return {
                "experimental": True, "backend": "LibreOffice Draw PDF import/export",
                "reconstructed_not_stream_patch": True,
                "pages": pages, "edited_page": target_page,
                "matched_text_shapes": 1, "output_bytes": dest.stat().st_size,
                "warning": "Layout, spacing, fonts, accessibility and PDF metadata may change.",
            }
        except BaseException:
            if dest.exists():
                dest.unlink()
            raise
        finally:
            if doc is not None:
                try:
                    doc.close(True)
                except Exception:
                    try:
                        doc.dispose()
                    except Exception:
                        pass
            proc.terminate()
            try:
                proc.wait(timeout=6)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--old", required=True)
    parser.add_argument("--new", required=True)
    parser.add_argument("--page", type=int)
    args = parser.parse_args()
    try:
        result = run(Path(args.input), Path(args.output), args.old, args.new, args.page)
    except Exception as exc:
        print(json.dumps({"status": "REJECTED", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps({"status": "PASS", **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
