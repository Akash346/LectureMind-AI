import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

import type { FacultyAccessibilityRemediation } from "@/lib/faculty/prompts";
import { logFacultyEvent } from "@/lib/faculty/logger";

export async function createAccessibleDocx(input: {
  sessionId: string;
  remediation: FacultyAccessibilityRemediation;
}) {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: input.remediation.document_title,
      heading: HeadingLevel.TITLE
    })
  ];

  for (const block of input.remediation.blocks) {
    if (block.type === "heading") {
      children.push(
        new Paragraph({
          text: block.text,
          heading: headingLevel(block.level)
        })
      );
    } else if (block.type === "paragraph") {
      children.push(
        new Paragraph({
          children: [new TextRun(block.text)]
        })
      );
    } else if (block.type === "list") {
      children.push(
        ...block.items.map(
          (item) =>
            new Paragraph({
              text: item,
              bullet: block.ordered ? undefined : { level: 0 },
              numbering: block.ordered
                ? { reference: "faculty-numbering", level: 0 }
                : undefined
            })
        )
      );
    } else if (block.type === "table") {
      if (block.caption) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.caption, bold: true })]
          })
        );
      }
      children.push(buildTable(block.headers, block.rows));
    } else if (block.type === "image_note") {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.decorative
                ? `Decorative image marked decorative: ${block.original_reference}`
                : `Image alt text for ${block.original_reference}: ${block.alt_text}`,
              italics: true
            })
          ]
        })
      );
    }
  }

  children.push(
    new Paragraph({
      text: "Human Review Notes",
      heading: HeadingLevel.HEADING_1
    }),
    new Paragraph(input.remediation.remediation_report.summary)
  );

  for (const note of input.remediation.remediation_report.human_review_needed) {
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `${note.location}: `, bold: true }),
          new TextRun(note.reason),
          ...(note.extracted_text ? [new TextRun(` Extracted: ${note.extracted_text}`)] : [])
        ]
      })
    );
  }

  const document = new Document({
    creator: "LectureMind",
    description: "Accessible Faculty remediation output",
    title: input.remediation.document_title,
    numbering: {
      config: [
        {
          reference: "faculty-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: "start"
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {},
        children
      }
    ]
  });
  const buffer = await Packer.toBuffer(document);

  logFacultyEvent("faculty_docx_created", {
    sessionId: input.sessionId,
    sizeBytes: buffer.length
  });

  return buffer;
}

function buildTable(headers: string[], rows: string[][]) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (header) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: header, bold: true })]
                })
              ]
            })
        )
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: headers.map(
              (_header, index) =>
                new TableCell({
                  children: [new Paragraph(row[index] ?? "")]
                })
            )
          })
      )
    ]
  });
}

function headingLevel(level: number) {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}
