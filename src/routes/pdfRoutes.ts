import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { watsonxService } from '../services/watsonxService';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel,
  BorderStyle, WidthType, ShadingType, AlignmentType, VerticalAlign
} from 'docx';

const router = Router();

const downloadsDir = fs.existsSync(path.join(__dirname, '../../public/downloads'))
  ? path.join(__dirname, '../../public/downloads')
  : path.join(process.cwd(), 'public/downloads');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

function cleanupOldDownloads() {
  try {
    const files = fs.readdirSync(downloadsDir);
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(downloadsDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    });
  } catch(e) {}
}

function cleanText(text: string): string {
  if (!text) return '';
  let str = String(text).trim();

  if (str.startsWith('{') && (str.includes('"proposal"') || str.includes('"email_body"'))) {
    try {
      const parsed = JSON.parse(str);
      str = parsed.proposal || parsed.email_body || parsed.summary || str;
      if (typeof str !== 'string') str = JSON.stringify(str);
    } catch {
      const match = str.match(/"proposal"\s*:\s*"([\s\S]*?)"\s*[,}]/);
      if (match) str = match[1];
    }
  }

  str = str.replace(/^\{?\s*"proposal"\s*:\s*"/i, '')
           .replace(/^\{?\s*"email_body"\s*:\s*"/i, '')
           .replace(/"\s*\}?\s*$/, '');

  return str
    .replace(/<[^>]*>/g, '')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}json`{0,3}/gi, '')
    .replace(/`{1,3}/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\|[-: |]+\|/gm, '')
    .replace(/^\s*\|\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractExecutiveSummary(proposalText: string): string {
  if (!proposalText) return '';
  const clean = cleanText(proposalText);
  const paras = clean.split('\n\n').filter(p => p.trim().length > 20);
  const firstPara = paras[0] || '';
  return firstPara.length > 400 ? firstPara.slice(0, 400) + '…' : firstPara;
}

function parseProposalSections(proposalText: string): Array<{ title: string; content: string }> {
  if (!proposalText) return [];
  const clean = cleanText(proposalText);
  const lines = clean.split('\n');
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d+\.\s+/.test(trimmed) && trimmed.length < 80) {
      if (currentTitle || currentContent.length) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
      }
      currentTitle = trimmed.replace(/^\d+\.\s+/, '');
      currentContent = [];
    } else if (trimmed) {
      currentContent.push(trimmed);
    }
  }
  if (currentTitle || currentContent.length) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
  }
  return sections;
}

function drawPdfTable(
  doc: typeof PDFDocument.prototype,
  startY: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  startX: number = 50
) {
  let currentY = startY;

  doc.font('Helvetica-Bold').fontSize(9.5);
  let maxHeaderHeight = 0;
  headers.forEach((header, i) => {
    const h = doc.heightOfString(header, { width: colWidths[i] - 16 }) + 14;
    if (h > maxHeaderHeight) maxHeaderHeight = h;
  });
  const headerHeight = Math.max(26, maxHeaderHeight);

  const renderHeader = (yPos: number) => {
    doc.rect(startX, yPos, colWidths.reduce((a, b) => a + b, 0), headerHeight).fill('#0f62fe');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5);
    let cx = startX;
    headers.forEach((header, i) => {
      doc.text(header.toUpperCase(), cx + 8, yPos + 8, { width: colWidths[i] - 16, align: 'left' });
      cx += colWidths[i];
    });
  };

  if (currentY > 700) { doc.addPage(); currentY = 50; }
  renderHeader(currentY);
  currentY += headerHeight;

  rows.forEach((row, rowIndex) => {
    doc.font('Helvetica').fontSize(9);
    let maxCellHeight = 0;
    row.forEach((cell, colIndex) => {
      const h = doc.heightOfString(cleanText(cell), { width: colWidths[colIndex] - 16 }) + 14;
      if (h > maxCellHeight) maxCellHeight = h;
    });
    const rowHeight = Math.max(26, maxCellHeight);

    if (currentY + rowHeight > 730) {
      doc.addPage(); currentY = 50;
      renderHeader(currentY); currentY += headerHeight;
    }

    const bg = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(bg);
    doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight)
      .strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    doc.fillColor('#1e293b').font('Helvetica').fontSize(9);
    let currentX = startX;
    row.forEach((cell, colIndex) => {
      doc.text(cleanText(cell), currentX + 8, currentY + 8, { width: colWidths[colIndex] - 16, align: 'left' });
      currentX += colWidths[colIndex];
    });

    currentY += rowHeight;
  });

  return currentY + 10;
}

router.get('/downloads/:filename', (req: Request, res: Response): void => {
  cleanupOldDownloads();
  const rawName = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = path.basename(rawName);
  const filePath = path.join(downloadsDir, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Not Found', message: 'File expired or not found.' });
    return;
  }

  const isDocx = filename.endsWith('.docx');
  res.setHeader('Content-Type', isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

function buildDownloadUrl(req: Request, fileName: string): string {
  const PRODUCTION_URL = 'https://partner-growth.2csujuhkf3ha.ca-tor.codeengine.appdomain.cloud';
  let baseUrl = process.env.PUBLIC_APP_URL || process.env.CODEENGINE_APP_URL || process.env.HOST_URL;
  if (!baseUrl) {
    const rawHost = ((req.headers['x-forwarded-host'] || req.get('host') || '') as string).trim();
    if (rawHost && !rawHost.includes('example.com') && !rawHost.includes('files.')) {
      const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const finalProto = rawHost.includes('localhost') ? 'http' : 'https';
      baseUrl = `${finalProto}://${rawHost}`;
    } else {
      baseUrl = PRODUCTION_URL;
    }
  }
  return `${baseUrl.replace(/\/+$/, '')}/downloads/${fileName}`;
}

const handlePdfGeneration = async (req: Request, res: Response): Promise<void> => {
  try {
    cleanupOldDownloads();
    let payload = req.body || {};

    if ((payload.raw_input || payload.input || payload.deal_context) && !payload.proposal) {
      const rawInput = payload.raw_input || payload.input || payload.deal_context;
      try {
        payload = await watsonxService.generateFullOpportunityPackage({
          raw_input: rawInput,
          industry: payload.industry,
          account_name: payload.account_name,
        });
      } catch(e) {}
    }

    const proposal = payload.proposal || {
      solution_name: 'IBM Pre-Sales Solution Proposal',
      recommended_ibm_stack: ['IBM watsonx.ai', 'watsonx Orchestrate', 'Red Hat OpenShift'],
      business_outcomes: ['Faster Time-to-Market', 'Enhanced Predictive Accuracy'],
      proposal: 'IBM watsonx solution providing AI analytics, automated orchestration, and enterprise security governance.',
    };

    const handoff_summary = payload.handoff_summary || {
      summary: 'Technical architecture incorporates watsonx.ai model serving with watsonx Orchestrate skill integrations.',
      next_steps: ['Conduct technical discovery workshop', 'Provision IBM Cloud sandbox environment', 'Deploy pilot MVP'],
      risks: ['Data schema compatibility with legacy ERP', 'API rate limiting during peak usage'],
    };

    const crm_stub = payload.crm_stub || {
      opportunity_name: proposal.solution_name || 'IBM Pre-Sales Opportunity',
      account_name: payload.account_name || 'Customer Account',
      stage: 'Qualification',
      estimated_value: '$150,000 USD',
      notes: 'Qualified pre-sales deal context generated by Partner Growth Copilot.',
    };

    const deal_score = payload.deal_score || {
      score: 85,
      reasoning: ['Strong business alignment'],
      missing_fields: ['Executive sponsor title'],
      recommended_path: 'Proceed to architecture blueprint phase',
      next_best_actions: ['Schedule architecture review'],
    };

    const fileName = `partner-growth-package-${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pdf`;
    const filePath = path.join(downloadsDir, fileName);

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const rawProposalText = typeof proposal.proposal === 'string'
      ? proposal.proposal
      : (proposal.proposal?.proposal || '');
    const execSummary = extractExecutiveSummary(rawProposalText);
    const proposalSections = parseProposalSections(rawProposalText);

    const stackStr = Array.isArray(proposal.recommended_ibm_stack)
      ? proposal.recommended_ibm_stack.join(', ')
      : 'IBM watsonx.ai, watsonx Orchestrate';
    const outcomesStr = Array.isArray(proposal.business_outcomes)
      ? proposal.business_outcomes.join(', ')
      : 'Optimized operations, improved efficiency';

    doc.rect(0, 0, 595, 70).fill('#0f62fe');
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('Partner Growth Copilot', 50, 20);
    doc.fillColor('#dbeafe').fontSize(10).font('Helvetica').text('IBM Enterprise Pre-Sales Solution Package', 50, 44);
    doc.fillColor('#93c5fd').fontSize(9).text(
      'Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      430, 44, { align: 'right' }
    );

    let y = 90;

    doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('1. IBM Solution Proposal', 50, y);
    y += 22;

    if (proposal.solution_name) {
      doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(cleanText(proposal.solution_name), 50, y);
      y += 18;
    }

    if (execSummary) {
      const boxHeight = Math.min(120, Math.max(48, Math.ceil(execSummary.length / 85) * 14 + 16));
      doc.rect(50, y, 495, boxHeight).fill('#eff6ff');
      doc.rect(50, y, 4, boxHeight).fill('#0f62fe');
      doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica')
        .text(execSummary, 64, y + 10, { width: 468, height: boxHeight - 20, lineGap: 3 });
      y += boxHeight + 16;
    }

    y = drawPdfTable(
      doc, y,
      ['Architecture Layer', 'IBM Technology / Capability', 'Target Business Value'],
      [
        ['AI & Analytics', stackStr, outcomesStr],
        ['Orchestration', 'watsonx Orchestrate Agent', 'Automated workflow execution & CRM sync'],
        ['Platform & Cloud', 'Red Hat OpenShift', 'Hybrid cloud deployment & security governance'],
      ],
      [120, 200, 175], 50
    );

    for (const section of proposalSections) {
      if (!section.content || section.content.length < 10) continue;
      if (section.title.toLowerCase().includes('executive summary')) continue;

      y += 12;
      if (y > 700) { doc.addPage(); y = 50; }

      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(section.title, 50, y);
      y += 16;

      const text = section.content.slice(0, 600);
      doc.fillColor('#334155').fontSize(9.5).font('Helvetica').text(text, 50, y, { width: 495, lineGap: 3 });
      y += doc.heightOfString(text, { width: 495 }) + 8;
    }

    y += 10;
    if (y > 700) { doc.addPage(); y = 50; }
    doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('2. Technical Handoff & Implementation', 50, y);
    y += 22;

    if (handoff_summary.summary) {
      const summaryClean = cleanText(handoff_summary.summary);
      doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica').text(summaryClean, 50, y, { width: 495, lineGap: 3 });
      y += doc.heightOfString(summaryClean, { width: 495 }) + 14;
    }

    const steps = Array.isArray(handoff_summary.next_steps) ? handoff_summary.next_steps : ['Conduct discovery workshop'];
    const risks = Array.isArray(handoff_summary.risks) ? handoff_summary.risks : ['Data integration latency'];
    const handoffRows: string[][] = [];
    const maxRows = Math.max(steps.length, risks.length);
    for (let i = 0; i < maxRows; i++) {
      handoffRows.push([`Phase ${i + 1}`, steps[i] || '—', risks[i] || 'Standard risk controls applied']);
    }

    y = drawPdfTable(doc, y,
      ['Milestone', 'Implementation Action Step', 'Risk & Mitigation Strategy'],
      handoffRows, [80, 215, 200], 50
    );

    if (y > 680) { doc.addPage(); y = 50; }
    y += 10;
    doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('3. CRM Opportunity Summary Record', 50, y);
    y += 22;

    y = drawPdfTable(doc, y,
      ['CRM Field', 'Details'],
      [
        ['Opportunity Name', cleanText(crm_stub.opportunity_name || proposal.solution_name || 'IBM Pre-Sales Opportunity')],
        ['Account Name', cleanText(crm_stub.account_name || 'Customer Account')],
        ['Sales Stage', crm_stub.stage || 'Qualification'],
        ['Contract Value', crm_stub.estimated_value || '$150,000 USD'],
        ['Opportunity Notes', cleanText(crm_stub.notes || 'Pre-sales opportunity created by Partner Growth Copilot.')],
      ],
      [150, 345], 50
    );

    if (y > 680) { doc.addPage(); y = 50; }
    y += 10;
    doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('4. Deal Readiness Evaluation & Scorecard', 50, y);
    y += 22;

    const score = deal_score.score || 85;
    const badgeBg = score >= 80 ? '#ecfdf5' : score >= 60 ? '#eff6ff' : '#fefce8';
    const badgeText = score >= 80 ? '#047857' : score >= 60 ? '#1d4ed8' : '#b45309';
    doc.rect(50, y, 495, 36).fill(badgeBg);
    doc.rect(50, y, 495, 36).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    doc.fillColor(badgeText).fontSize(14).font('Helvetica-Bold')
      .text(`Readiness Score: ${score}/100 — ${score >= 80 ? 'Deal Ready ✓' : 'Promising Opportunity'}`, 64, y + 10);
    y += 50;

    const missing = Array.isArray(deal_score.missing_fields) ? deal_score.missing_fields.join('; ') : 'None identified';
    const actions = Array.isArray(deal_score.next_best_actions) ? deal_score.next_best_actions.join('; ') : 'Schedule architecture review';

    y = drawPdfTable(doc, y,
      ['Evaluation Metric', 'Details & Strategic Recommendations'],
      [
        ['Missing Information', missing],
        ['Recommended Next Actions', actions],
      ],
      [150, 345], 50
    );

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
        .text(`Partner Growth Copilot  |  Page ${i + 1} of ${pageCount}  |  IBM Pre-Sales AI Platform  |  Powered by watsonx.ai`,
          50, 780, { align: 'center', width: 495 });
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const download_url = buildDownloadUrl(req, fileName);

    res.status(200).json({
      success: true,
      file_name: fileName,
      content_type: 'application/pdf',
      download_url,
      display_message: `Your PDF package is ready. Direct Download URL: ${download_url}`,
      download_markdown: `[Download PDF Package](${download_url})`,
      expires_in_minutes: 60,
      summary: `PDF package for ${proposal.solution_name} generated successfully.`,
    });
  } catch (err: any) {
    console.error('[pdfRoutes Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err?.message || 'PDF generation failed.',
      details: [err?.message || 'PDF generation failed.'],
    });
  }
};

router.post('/api/documents/pdf', apiKeyAuth, handlePdfGeneration);
router.post('/api/generate-pdf', apiKeyAuth, handlePdfGeneration);

const handleDocxGeneration = async (req: Request, res: Response): Promise<void> => {
  try {
    cleanupOldDownloads();
    let payload = req.body || {};

    if ((payload.raw_input || payload.input || payload.deal_context) && !payload.proposal) {
      const rawInput = payload.raw_input || payload.input || payload.deal_context;
      try {
        payload = await watsonxService.generateFullOpportunityPackage({
          raw_input: rawInput,
          industry: payload.industry,
          account_name: payload.account_name,
        });
      } catch(e) {}
    }

    const proposal = payload.proposal || {
      solution_name: 'IBM Pre-Sales Solution Proposal',
      recommended_ibm_stack: ['IBM watsonx.ai', 'watsonx Orchestrate', 'Red Hat OpenShift'],
      business_outcomes: ['Improved efficiency', 'Reduced costs'],
      proposal: 'IBM watsonx solution providing AI analytics and automated orchestration.',
    };

    const handoff = payload.handoff_summary || {
      summary: 'Technical architecture incorporates watsonx.ai model serving.',
      next_steps: ['Conduct discovery workshop', 'Provision IBM Cloud sandbox'],
      risks: ['Data integration latency', 'Change management'],
    };

    const crm = payload.crm_stub || {
      opportunity_name: proposal.solution_name || 'IBM Opportunity',
      account_name: 'Customer Account',
      stage: 'Qualification',
      estimated_value: '$150,000 USD',
      notes: 'Pre-sales opportunity generated by Partner Growth Copilot.',
    };

    const deal_score = payload.deal_score || { score: 85, missing_fields: [], next_best_actions: [] };

    const rawProposalText = typeof proposal.proposal === 'string'
      ? proposal.proposal
      : (proposal.proposal?.proposal || '');
    const proposalSections = parseProposalSections(rawProposalText);

    const IBM_BLUE = '0F62FE';
    const DARK = '0F172A';
    const GRAY = '475569';

    const makeHeaderRow = (cells: string[], widths: number[]): TableRow =>
      new TableRow({
        children: cells.map((cell, i) =>
          new TableCell({
            width: { size: widths[i], type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: IBM_BLUE, fill: IBM_BLUE },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              children: [new TextRun({ text: cell.toUpperCase(), bold: true, color: 'FFFFFF', size: 18, font: 'Calibri' })],
              alignment: AlignmentType.LEFT,
              spacing: { before: 60, after: 60 },
            })],
          })
        ),
        tableHeader: true,
      });

    const makeDataRow = (cells: string[], widths: number[], shade: boolean): TableRow =>
      new TableRow({
        children: cells.map((cell, i) =>
          new TableCell({
            width: { size: widths[i], type: WidthType.DXA },
            shading: shade ? { type: ShadingType.SOLID, color: 'F8FAFC', fill: 'F8FAFC' } : undefined,
            children: [new Paragraph({
              children: [new TextRun({ text: cleanText(cell), size: 18, font: 'Calibri', color: GRAY })],
              spacing: { before: 60, after: 60 },
            })],
          })
        ),
      });

    const stackStr = Array.isArray(proposal.recommended_ibm_stack)
      ? proposal.recommended_ibm_stack.join(', ') : 'IBM watsonx.ai';
    const outcomesStr = Array.isArray(proposal.business_outcomes)
      ? proposal.business_outcomes.join(', ') : 'Enhanced efficiency';

    const ibmStackTable = new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        makeHeaderRow(['Architecture Layer', 'IBM Technology / Capability', 'Target Business Value'], [2000, 3500, 3500]),
        makeDataRow(['AI & Analytics', stackStr, outcomesStr], [2000, 3500, 3500], true),
        makeDataRow(['Orchestration', 'watsonx Orchestrate Agent', 'Automated workflow execution & CRM sync'], [2000, 3500, 3500], false),
        makeDataRow(['Platform & Cloud', 'Red Hat OpenShift', 'Hybrid cloud deployment & security governance'], [2000, 3500, 3500], true),
      ],
    });

    const steps = Array.isArray(handoff.next_steps) ? handoff.next_steps : [];
    const risks = Array.isArray(handoff.risks) ? handoff.risks : [];
    const handoffRows = Array.from({ length: Math.max(steps.length, risks.length) }, (_, i) =>
      makeDataRow([`Phase ${i+1}`, steps[i] || '—', risks[i] || 'Standard risk controls'], [1500, 3750, 3750], i % 2 === 0)
    );

    const handoffTable = new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        makeHeaderRow(['Milestone', 'Implementation Action Step', 'Risk & Mitigation'], [1500, 3750, 3750]),
        ...handoffRows,
      ],
    });

    const crmTable = new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        makeHeaderRow(['CRM Field', 'Details'], [2500, 6500]),
        makeDataRow(['Opportunity Name', cleanText(crm.opportunity_name || '')], [2500, 6500], true),
        makeDataRow(['Account Name', cleanText(crm.account_name || '')], [2500, 6500], false),
        makeDataRow(['Sales Stage', crm.stage || 'Qualification'], [2500, 6500], true),
        makeDataRow(['Contract Value', crm.estimated_value || '$150,000 USD'], [2500, 6500], false),
        makeDataRow(['Notes', cleanText(crm.notes || '')], [2500, 6500], true),
      ],
    });

    const docChildren: any[] = [
      new Paragraph({
        children: [new TextRun({ text: 'Partner Growth Copilot', bold: true, size: 48, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'IBM Enterprise Pre-Sales Solution Package', size: 24, color: GRAY, font: 'Calibri' })],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, size: 20, color: '94A3B8', font: 'Calibri' })],
        spacing: { after: 600 },
      }),

      new Paragraph({
        children: [new TextRun({ text: '1. IBM Solution Proposal', bold: true, size: 32, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cleanText(proposal.solution_name || ''), bold: true, size: 26, color: DARK, font: 'Calibri' })],
        spacing: { after: 160 },
      }),

      ...proposalSections.map(sec => [
        new Paragraph({
          children: [new TextRun({ text: sec.title, bold: true, size: 22, color: DARK, font: 'Calibri' })],
          spacing: { before: 200, after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: cleanText(sec.content).slice(0, 800), size: 19, color: GRAY, font: 'Calibri' })],
          spacing: { after: 120 },
        }),
      ]).flat(),

      ibmStackTable,
      new Paragraph({ spacing: { after: 300 } }),

      new Paragraph({
        children: [new TextRun({ text: '2. Technical Handoff & Implementation', bold: true, size: 32, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cleanText(handoff.summary || ''), size: 19, color: GRAY, font: 'Calibri' })],
        spacing: { after: 160 },
      }),
      handoffTable,
      new Paragraph({ spacing: { after: 300 } }),

      new Paragraph({
        children: [new TextRun({ text: '3. CRM Opportunity Record', bold: true, size: 32, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      crmTable,
      new Paragraph({ spacing: { after: 300 } }),

      new Paragraph({
        children: [new TextRun({ text: '4. Deal Readiness Scorecard', bold: true, size: 32, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({
          text: `Readiness Score: ${deal_score.score || 85}/100 — ${(deal_score.score || 85) >= 80 ? 'Deal Ready ✓' : 'Promising Opportunity'}`,
          bold: true, size: 26,
          color: (deal_score.score || 85) >= 80 ? '047857' : '1d4ed8',
          font: 'Calibri',
        })],
        spacing: { after: 160 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Missing Information: ', bold: true, size: 20, font: 'Calibri', color: DARK }),
          new TextRun({ text: Array.isArray(deal_score.missing_fields) ? deal_score.missing_fields.join('; ') : 'None', size: 20, font: 'Calibri', color: GRAY }),
        ],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Next Best Actions: ', bold: true, size: 20, font: 'Calibri', color: DARK }),
          new TextRun({ text: Array.isArray(deal_score.next_best_actions) ? deal_score.next_best_actions.join('; ') : 'Schedule architecture review', size: 20, font: 'Calibri', color: GRAY }),
        ],
      }),

      new Paragraph({
        children: [new TextRun({ text: 'Partner Growth Copilot | Powered by IBM watsonx.ai & watsonx Orchestrate', size: 16, color: '94A3B8', font: 'Calibri' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
      }),
    ];

    const wordDoc = new Document({
      sections: [{ properties: {}, children: docChildren }],
    });

    const buffer = await Packer.toBuffer(wordDoc);
    const fileName = `partner-growth-package-${Date.now()}_${crypto.randomBytes(4).toString('hex')}.docx`;
    const filePath = path.join(downloadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const download_url = buildDownloadUrl(req, fileName);
    res.status(200).json({
      success: true,
      file_name: fileName,
      content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      download_url,
      display_message: `Your Word document is ready. Direct Download URL: ${download_url}`,
      download_markdown: `[Download Word Package](${download_url})`,
      expires_in_minutes: 60,
      summary: `Word package generated successfully.`,
    });
  } catch (err: any) {
    console.error('[docxRoutes Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err?.message || 'DOCX generation failed.',
      details: [err?.message || 'DOCX generation error.'],
    });
  }
};

router.post('/api/documents/docx', apiKeyAuth, handleDocxGeneration);
router.post('/api/generate-docx', apiKeyAuth, handleDocxGeneration);

export default router;
