// Generates PDFs from markdown content — useful for exporting codebase reports and documentation.

import path from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";

export async function generatePdf(
  filePath: string,
  content: string,
  repoPath: string,
): Promise<string> {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(repoPath, filePath);

  try {
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ margin: 72 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    return new Promise((resolve) => {
      doc.on("end", () => {
        try {
          writeFileSync(fullPath, Buffer.concat(chunks));
          resolve(`PDF generated: ${fullPath}`);
        } catch (err) {
          resolve(
            `Error writing PDF: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });

      doc.on("error", (err: Error) => {
        resolve(`Error generating PDF: ${err.message}`);
      });

      const lines = content.split("\n");
      let firstElement = true;

      const addSpacingBefore = () => {
        if (!firstElement) doc.moveDown(0.5);
        firstElement = false;
      };

      const bullets: string[] = [];

      const flushBullets = () => {
        if (bullets.length === 0) return;
        addSpacingBefore();
        for (const bullet of bullets) {
          doc
            .fontSize(11)
            .fillColor("#333333")
            .text(`• ${bullet}`, { indent: 20, lineGap: 3 });
        }
        bullets.length = 0;
      };

      for (const raw of lines) {
        const line = raw.trimEnd();

        if (line.startsWith("# ")) {
          flushBullets();
          addSpacingBefore();
          doc
            .fontSize(22)
            .fillColor("#000000")
            .font("Helvetica-Bold")
            .text(line.slice(2));
          doc.moveDown(0.2);
          doc
            .moveTo(72, doc.y)
            .lineTo(doc.page.width - 72, doc.y)
            .strokeColor("#000000")
            .lineWidth(1)
            .stroke();
          doc.moveDown(0.4);
          doc.font("Helvetica");
        } else if (line.startsWith("## ")) {
          flushBullets();
          addSpacingBefore();
          doc
            .fontSize(16)
            .fillColor("#111111")
            .font("Helvetica-Bold")
            .text(line.slice(3));
          doc.moveDown(0.2);
          doc
            .moveTo(72, doc.y)
            .lineTo(doc.page.width - 72, doc.y)
            .strokeColor("#999999")
            .lineWidth(0.5)
            .stroke();
          doc.moveDown(0.3);
          doc.font("Helvetica");
        } else if (line.startsWith("### ")) {
          flushBullets();
          addSpacingBefore();
          doc
            .fontSize(13)
            .fillColor("#222222")
            .font("Helvetica-Bold")
            .text(line.slice(4));
          doc.font("Helvetica");
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          bullets.push(line.slice(2));
        } else if (line.startsWith("---")) {
          flushBullets();
          doc.moveDown(0.5);
          doc
            .moveTo(72, doc.y)
            .lineTo(doc.page.width - 72, doc.y)
            .strokeColor("#cccccc")
            .lineWidth(0.5)
            .stroke();
          doc.moveDown(0.5);
        } else if (line === "") {
          flushBullets();
        } else {
          flushBullets();
          addSpacingBefore();
          // handle inline bold (**text**) and inline code (`text`)
          const segments = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
          let isFirst = true;
          for (const seg of segments) {
            if (seg.startsWith("**") && seg.endsWith("**")) {
              doc
                .fontSize(11)
                .fillColor("#333333")
                .font("Helvetica-Bold")
                .text(seg.slice(2, -2), { continued: true, lineGap: 3 });
              doc.font("Helvetica");
            } else if (seg.startsWith("`") && seg.endsWith("`")) {
              doc
                .fontSize(10)
                .fillColor("#c0392b")
                .font("Courier")
                .text(seg.slice(1, -1), { continued: true, lineGap: 3 });
              doc.font("Helvetica").fontSize(11).fillColor("#333333");
            } else if (seg.length > 0) {
              doc
                .fontSize(11)
                .fillColor("#333333")
                .font("Helvetica")
                .text(seg, { continued: true, lineGap: 3 });
            }
            isFirst = false;
          }
          // end the continued text
          doc.text("", { continued: false });
        }
      }

      flushBullets();
      doc.end();
    });
  } catch (err) {
    return `Error generating PDF: ${err instanceof Error ? err.message : String(err)}`;
  }
}
