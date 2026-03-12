import path from "path";
import os from "os";
import { existsSync, mkdirSync, writeFileSync } from "fs";

export function generatePdf(
  filePath: string,
  content: string,
  repoPath: string,
): string {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(repoPath, filePath);

  try {
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const escaped = content
      .replace(/\\/g, "\\\\")
      .replace(/"""/g, '\\"\\"\\"')
      .replace(/\r/g, "");

    const script = `
import sys
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "reportlab", "--break-system-packages", "-q"])
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors

doc = SimpleDocTemplate(
    r"""${fullPath}""",
    pagesize=letter,
    rightMargin=inch,
    leftMargin=inch,
    topMargin=inch,
    bottomMargin=inch,
)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="H1", parent=styles["Heading1"], fontSize=22, spaceAfter=10))
styles.add(ParagraphStyle(name="H2", parent=styles["Heading2"], fontSize=16, spaceAfter=8))
styles.add(ParagraphStyle(name="H3", parent=styles["Heading3"], fontSize=13, spaceAfter=6))
styles.add(ParagraphStyle(name="Body", parent=styles["Normal"], fontSize=11, leading=16, spaceAfter=8))
styles.add(ParagraphStyle(name="Bullet", parent=styles["Normal"], fontSize=11, leading=16, leftIndent=20, spaceAfter=4, bulletIndent=10))

raw = """${escaped}"""

story = []
for line in raw.split("\\n"):
    s = line.rstrip()
    if s.startswith("### "):
        story.append(Paragraph(s[4:], styles["H3"]))
    elif s.startswith("## "):
        story.append(Spacer(1, 6))
        story.append(Paragraph(s[3:], styles["H2"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey, spaceAfter=4))
    elif s.startswith("# "):
        story.append(Paragraph(s[2:], styles["H1"]))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.black, spaceAfter=6))
    elif s.startswith("- ") or s.startswith("* "):
        story.append(Paragraph(u"\\u2022  " + s[2:], styles["Bullet"]))
    elif s.startswith("---"):
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey, spaceAfter=4))
    elif s == "":
        story.append(Spacer(1, 6))
    else:
        import re
        s = re.sub(r"\\*\\*(.+?)\\*\\*", r"<b>\\1</b>", s)
        s = re.sub(r"\\*(.+?)\\*", r"<i>\\1</i>", s)
        s = re.sub(r"\`(.+?)\`", r"<font name='Courier'>\\1</font>", s)
        story.append(Paragraph(s, styles["Body"]))

doc.build(story)
print("OK")
`
      .replace("${fullPath}", fullPath.replace(/\\/g, "/"))
      .replace("${escaped}", escaped);

    const tmpFile = path.join(os.tmpdir(), `lens_pdf_${Date.now()}.py`);
    writeFileSync(tmpFile, script, "utf-8");

    const { execSync } =
      require("child_process") as typeof import("child_process");
    execSync(`python "${tmpFile}"`, { stdio: "pipe" });

    try {
      require("fs").unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }

    return `PDF generated: ${fullPath}`;
  } catch (err) {
    return `Error generating PDF: ${err instanceof Error ? err.message : String(err)}`;
  }
}
