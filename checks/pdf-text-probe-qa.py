#!/usr/bin/env python3
"""Real-file isolated QA: LibreOffice Draw editing of one existing PDF text object."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "experiments" / "draw_pdf_text_probe.py"
FONT = Path("/usr/share/fonts/truetype/arphic-gbsn00lp/gbsn00lp.ttf")


def text(pdf):
    return subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)


def run(*args, success):
    result = subprocess.run([sys.executable, str(HELPER), *args], text=True, capture_output=True, timeout=50)
    if (result.returncode == 0) != success:
        raise AssertionError("Expected success " + str(success) + ": " + result.stdout + " / " + result.stderr)
    payload = json.loads(result.stdout if success else result.stderr)
    if success:
        assert payload["status"] == "PASS"
    else:
        assert payload["status"] == "REJECTED"
    return payload


def draw(pdf, duplicate=False, blank=False):
    p = canvas.Canvas(str(pdf), pagesize=A4)
    p.setFont("Chinese", 14)
    if blank:
        p.rect(80, 630, 320, 80)
    else:
        p.drawString(60, 720, "合同金额：100元")
        p.drawString(60, 650, "客户名称：李先生")
        if duplicate:
            p.drawString(60, 600, "合同金额：100元")
        p.line(60, 570, 420, 570)
    p.showPage()
    p.setFont("Chinese", 13)
    p.drawString(60, 720, "第二页：原文不可更改")
    p.showPage()
    p.save()


def main():
    if not FONT.is_file():
        raise AssertionError("CI requires fonts-arphic-gbsn00lp: " + str(FONT))
    pdfmetrics.registerFont(TTFont("Chinese", str(FONT)))
    with tempfile.TemporaryDirectory(prefix="wish-pdf-edit-acceptance-") as folder:
        tmp = Path(folder)
        original = tmp / "source.pdf"
        edited = tmp / "changed.pdf"
        draw(original)
        checksum = hashlib.sha256(original.read_bytes()).hexdigest()
        before = text(original)
        assert "合同金额：100元" in before and "第二页：" in before
        result = run(
            "--input", str(original), "--output", str(edited),
            "--old", "合同金额：100元", "--new", "合同金额：200元",
            "--page", "1", success=True
        )
        output = text(edited)
        assert re.search(r"合同金额：\s*200\s*元", output), output
        assert "合同金额：100元" not in output, output
        assert "客户名称：李先生" in output
        assert "第二页：原文不可更改" in output
        assert hashlib.sha256(original.read_bytes()).hexdigest() == checksum
        info = subprocess.check_output(["pdfinfo", str(edited)], text=True)
        assert re.search(r"Pages:\s+2", info)
        assert result["pages"] == 2 and result["matched_text_shapes"] == 1
        multi = tmp / "ambiguous.pdf"
        draw(multi, duplicate=True)
        failed_output = tmp / "should-not-exist.pdf"
        rejected = run(
            "--input", str(multi), "--output", str(failed_output),
            "--old", "合同金额：100元", "--new", "合同金额：200元",
            success=False
        )
        assert not failed_output.exists()
        scanned = tmp / "no-text.pdf"
        draw(scanned, blank=True)
        rejected_scan = run(
            "--input", str(scanned), "--output", str(failed_output),
            "--old", "合同金额：100元", "--new", "合同金额：200元",
            success=False
        )
        assert not failed_output.exists()
        print(json.dumps({
            "status": "PASS", "scope": "experimental Linux LibreOffice Draw UNO",
            "sourcePageCount": 2, "editedPageCount": 2,
            "originalTextRemoved": True, "newChineseTextPresent": True,
            "unmodifiedSecondPage": True, "originalSHA256Unchanged": True,
            "ambiguousTextRejected": rejected["status"] == "REJECTED",
            "uneditablePageRejected": rejected_scan["status"] == "REJECTED",
            "formatChangesPossible": True, "spacingChangedInCI": "合同金额： 200" in output, "productionReady": False
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
