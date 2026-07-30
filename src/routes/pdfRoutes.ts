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

  str = str.replace(/&quot;/gi, '"')
           .replace(/&amp;/gi, '&')
           .replace(/&lt;/gi, '<')
           .replace(/&gt;/gi, '>')
           .replace(/&#39;/gi, "'")
           .replace(/&nbsp;/gi, ' ');

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
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}json`{0,3}/gi, '')
    .replace(/`{1,3}/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
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
        if (!/email|follow-up|followup/i.test(currentTitle)) {
          sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
        }
      }
      currentTitle = trimmed.replace(/^\d+\.\s+/, '');
      currentContent = [];
    } else if (trimmed) {
      currentContent.push(trimmed);
    }
  }
  if ((currentTitle || currentContent.length) && !/email|follow-up|followup/i.test(currentTitle)) {
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

function renderFormattedPdfContent(
  doc: typeof PDFDocument.prototype,
  rawContent: string,
  startY: number
): number {
  let currentY = startY;
  if (!rawContent || !rawContent.trim()) return currentY;

  const lines = rawContent.split('\n');
  let i = 0;

  while (i < lines.length) {
    let line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    if (line.startsWith('|')) {
      const tableRows: string[][] = [];
      let headers: string[] = [];

      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowStr = lines[i].trim();
        if (/^\|?[-:\s|]+\|?$/.test(rowStr)) {
          i++;
          continue;
        }

        const cells = rowStr.replace(/^\||\|$/g, '').split('|').map(c => cleanText(c));
        if (headers.length === 0) {
          headers = cells;
        } else {
          tableRows.push(cells);
        }
        i++;
      }

      if (headers.length > 0) {
        const totalWidth = 495;
        const colCount = headers.length;
        const colWidths = Array(colCount).fill(Math.floor(totalWidth / colCount));
        colWidths[colCount - 1] += totalWidth - colWidths.reduce((a, b) => a + b, 0);

        if (currentY > 680) { doc.addPage(); currentY = 50; }
        currentY = drawPdfTable(doc, currentY, headers, tableRows, colWidths, 50);
      }
      continue;
    }

    const isSubhead = /^(?:#{1,4}\s+|(?:\*\*|\*)?[A-Z][A-Za-z0-9\s\&\-\(\)]+(?:\*\*|\*)?:?$)/.test(line) && line.length < 90 && !line.startsWith('-');
    if (isSubhead) {
      const cleanSubhead = cleanText(line).replace(/^[:\s]+|[:\s]+$/g, '');
      if (cleanSubhead) {
        if (currentY > 700) { doc.addPage(); currentY = 50; }
        currentY += 6;
        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(cleanSubhead, 50, currentY);
        currentY += doc.heightOfString(cleanSubhead, { width: 495 }) + 6;
      }
      i++;
      continue;
    }

    if (/^[-*•+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const bulletText = cleanText(line.replace(/^[-*•+\d.]+\s*/, ''));
      if (bulletText) {
        if (currentY > 710) { doc.addPage(); currentY = 50; }
        doc.fillColor('#0f62fe').fontSize(10).font('Helvetica-Bold').text('•', 56, currentY);
        doc.fillColor('#334155').fontSize(9).font('Helvetica').text(bulletText, 68, currentY, { width: 477, lineGap: 2 });
        currentY += Math.max(14, doc.heightOfString(bulletText, { width: 477 }) + 4);
      }
      i++;
      continue;
    }

    const paraText = cleanText(line);
    if (paraText) {
      if (currentY > 700) { doc.addPage(); currentY = 50; }
      doc.fillColor('#334155').fontSize(9).font('Helvetica').text(paraText, 50, currentY, { width: 495, lineGap: 3 });
      currentY += doc.heightOfString(paraText, { width: 495 }) + 8;
    }
    i++;
  }

  return currentY;
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

function extractStructuredFromRawText(rawText: string) {
  if (!rawText) return {};
  const clean = cleanText(rawText);

  let solution_name = '';
  const solMatch = clean.match(/Solution Name:\s*([^\n]+)/i) ||
                   clean.match(/###?\s*5?\.\s*IBM Solution Proposal Blueprint\s*\n+([^\n]+)/i) ||
                   clean.match(/###?\s*1?\.\s*([^\n]+Solution[^\n]*)/i);
  if (solMatch && solMatch[1]) {
    solution_name = solMatch[1].trim().replace(/^[*#\s]+|[*#\s]+$/g, '');
  }

  const stackItems: string[] = [];
  const stackMatch = clean.match(/(?:Recommended IBM Stack|IBM Stack|Recommended Stack)[\s\S]*?(?=\n\n|\n[A-Z0-9#]|$)/i);
  if (stackMatch) {
    const lines = stackMatch[0].split('\n');
    for (const l of lines) {
      const item = l.replace(/^[-*•\d.]+\s*/, '').trim();
      if (item && !/Recommended IBM Stack|IBM Stack|Architecture Overview/i.test(item) && item.length < 80) {
        stackItems.push(item);
      }
    }
  }

  if (stackItems.length === 0) {
    const knownProducts = [
      'IBM Watson IoT', 'Watson IoT', 'IBM Cloud Pak for Data', 'Cloud Pak for Data',
      'IBM Watson Studio', 'Watson Studio', 'IBM Cloud Pak for Automation', 'Cloud Pak for Automation',
      'Red Hat OpenShift', 'IBM watsonx.ai', 'IBM watsonx Orchestrate', 'IBM watsonx.data',
      'IBM App Connect', 'IBM MQ', 'IBM Instana'
    ];
    for (const prod of knownProducts) {
      if (new RegExp(`\\b${prod.replace('.', '\\.')}\\b`, 'i').test(clean)) {
        if (!stackItems.includes(prod)) stackItems.push(prod);
      }
    }
  }

  let account_name = '';
  const accMatch = clean.match(/(?:Customer|Account Name|Account):\s*([^\n;,\.]+)/i);
  if (accMatch && accMatch[1]) {
    account_name = accMatch[1].trim();
  }

  const nextSteps: string[] = [];
  const stepsMatch = clean.match(/(?:Next Steps|Implementation Roadmap)[\s\S]*?(?=\n\n|\n[A-Z0-9#]|$)/i);
  if (stepsMatch) {
    const lines = stepsMatch[0].split('\n');
    for (const l of lines) {
      const item = l.replace(/^[-*•\d.]+\s*/, '').trim();
      if (item && !/Next Steps|Implementation Roadmap|Risks/i.test(item) && item.length < 120) {
        nextSteps.push(item);
      }
    }
  }

  const risks: string[] = [];
  const risksMatch = clean.match(/(?:Risks|Risk & Mitigation)[\s\S]*?(?=\n\n|\n[A-Z0-9#]|$)/i);
  if (risksMatch) {
    const lines = risksMatch[0].split('\n');
    for (const l of lines) {
      const item = l.replace(/^[-*•\d.]+\s*/, '').trim();
      if (item && !/Risks|Risk & Mitigation/i.test(item) && item.length < 120) {
        risks.push(item);
      }
    }
  }

  return {
    solution_name: solution_name || undefined,
    recommended_ibm_stack: stackItems.length > 0 ? stackItems : undefined,
    account_name: account_name || undefined,
    next_steps: nextSteps.length > 0 ? nextSteps : undefined,
    risks: risks.length > 0 ? risks : undefined,
  };
}

const handlePdfGeneration = async (req: Request, res: Response): Promise<void> => {
  try {
    cleanupOldDownloads();
    let payload = req.body || {};
    const rawString = typeof payload === 'string' ? payload : (payload.raw_input || payload.input || payload.deal_context || payload.proposal || JSON.stringify(payload));
    const extracted = extractStructuredFromRawText(rawString);

    if ((payload.raw_input || payload.input || payload.deal_context) && !payload.proposal) {
      console.warn('[pdfRoutes] Missing proposal in payload, using raw_input as deal_context without regeneration');
    }

    const proposal = payload.proposal || {};
    if (extracted.solution_name && (!proposal.solution_name || proposal.solution_name === 'IBM Pre-Sales Solution Proposal' || proposal.solution_name === 'IBM watsonx Enterprise Solution')) {
      proposal.solution_name = extracted.solution_name;
    }
    if (extracted.recommended_ibm_stack && extracted.recommended_ibm_stack.length > 0) {
      proposal.recommended_ibm_stack = extracted.recommended_ibm_stack;
    }
    if (!proposal.solution_name) proposal.solution_name = extracted.solution_name || 'IBM Pre-Sales Solution Proposal';
    if (!proposal.recommended_ibm_stack || proposal.recommended_ibm_stack.length === 0) {
      proposal.recommended_ibm_stack = ['IBM watsonx.ai', 'watsonx Orchestrate', 'Red Hat OpenShift'];
    }

    const handoff_summary = payload.handoff_summary || {
      summary: 'Technical architecture incorporates IBM service integration and cloud runtime deployment.',
      next_steps: extracted.next_steps || ['Conduct technical discovery workshop', 'Provision IBM Cloud sandbox environment', 'Deploy pilot MVP'],
      risks: extracted.risks || ['Data schema compatibility with legacy ERP', 'API rate limiting during peak usage'],
    };

    const crm_stub = payload.crm_stub || {
      opportunity_name: proposal.solution_name || 'IBM Pre-Sales Opportunity',
      account_name: payload.account_name || extracted.account_name || 'Customer Account',
      stage: 'Qualification',
      estimated_value: '$150,000 USD',
      notes: 'Qualified pre-sales deal context generated by Partner Growth Copilot.',
    };

    const deal_score = payload.deal_score || {
      score: 85,
      reasoning: ['Strong business alignment'],
      missing_fields: [],
      recommended_path: 'Proceed to architecture blueprint phase',
      next_best_actions: ['Schedule architecture review'],
    };

    const followup_email = payload.followup_email || {
      subject: payload.subject || `Follow-up: ${proposal.solution_name || 'IBM Solution Proposal'} Overview`,
      email_body: payload.email_body || 'As discussed, IBM offers an enterprise-grade solution tailored to your operational goals.',
    };

    console.log('[PDF Debug Payload]', JSON.stringify({
      solution_name: proposal.solution_name,
      recommended_ibm_stack: proposal.recommended_ibm_stack,
      crm_stub,
      deal_score,
      followup_email,
      handoff_summary,
    }, null, 2));

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

    doc.rect(0, 0, 595, 70).fill('#0f62fe');
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('Partner Growth Copilot', 50, 20);
    doc.fillColor('#dbeafe').fontSize(10).font('Helvetica').text('IBM Enterprise Pre-Sales Solution Package', 50, 44);
    doc.fillColor('#93c5fd').fontSize(9).text(
      'Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      430, 44, { align: 'right' }
    );

    let y = 90;

    // 1. CRM Opportunity Stub
    doc.fillColor('#0f62fe').fontSize(13).font('Helvetica-Bold').text('1. CRM Opportunity Stub', 50, y);
    y += 18;
    y = drawPdfTable(doc, y,
      ['CRM Field', 'Value'],
      [
        ['Account Name', cleanText(crm_stub.account_name || 'Customer Account')],
        ['Opportunity Name', cleanText(crm_stub.opportunity_name || proposal.solution_name || 'IBM Pre-Sales Opportunity')],
        ['Estimated Value', crm_stub.estimated_value || '$250,000 USD'],
        ['Sales Stage', crm_stub.stage || 'Qualification'],
        ['Notes', cleanText(crm_stub.notes || 'Qualified pre-sales deal context generated by Partner Growth Copilot.')],
      ],
      [150, 345], 50
    );

    // 2. Deal Readiness Score
    y += 10;
    if (y > 680) { doc.addPage(); y = 50; }
    doc.fillColor('#0f62fe').fontSize(13).font('Helvetica-Bold').text('2. Deal Readiness Score', 50, y);
    y += 18;

    const score = deal_score.score || 85;
    const badgeBg = score >= 80 ? '#ecfdf5' : score >= 60 ? '#eff6ff' : '#fefce8';
    const badgeText = score >= 80 ? '#047857' : score >= 60 ? '#1d4ed8' : '#b45309';
    doc.rect(50, y, 495, 32).fill(badgeBg);
    doc.rect(50, y, 495, 32).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    doc.fillColor(badgeText).fontSize(12).font('Helvetica-Bold')
      .text(`Score: ${score} / 100 — ${score >= 80 ? 'Deal Ready ✓ (Move to Executive Presentation)' : 'Promising Opportunity'}`, 64, y + 9);
    y += 42;

    const missing = Array.isArray(deal_score.missing_fields) && deal_score.missing_fields.length > 0 ? deal_score.missing_fields.join(', ') : 'None';
    const reasoningStr = Array.isArray(deal_score.reasoning) ? deal_score.reasoning.join(' ') : (deal_score.reasoning || 'Industry, business problem, budget, timeline, and clear use-case defined.');
    y = drawPdfTable(doc, y,
      ['Evaluation Metric', 'Details'],
      [
        ['Missing Fields', missing],
        ['Reasoning', cleanText(reasoningStr)],
        ['Recommended Path', cleanText(deal_score.recommended_path || 'Proposal-ready — move to executive presentation.')],
      ],
      [150, 345], 50
    );

    // 3. Technical Handoff Summary
    y += 10;
    if (y > 680) { doc.addPage(); y = 50; }
    doc.fillColor('#0f62fe').fontSize(13).font('Helvetica-Bold').text('3. Technical Handoff Summary', 50, y);
    y += 18;

    if (handoff_summary.summary) {
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica').text(cleanText(handoff_summary.summary), 50, y, { width: 495, lineGap: 3 });
      y += doc.heightOfString(cleanText(handoff_summary.summary), { width: 495 }) + 10;
    }

    const steps = Array.isArray(handoff_summary.next_steps) ? handoff_summary.next_steps : ['Conduct discovery workshop'];
    const risks = Array.isArray(handoff_summary.risks) ? handoff_summary.risks : ['Data integration latency'];
    const handoffRows: string[][] = [];
    const maxRows = Math.max(steps.length, risks.length);
    for (let i = 0; i < maxRows; i++) {
      handoffRows.push([`Step ${i + 1}`, steps[i] || '—', risks[i] || 'Standard risk controls applied']);
    }

    y = drawPdfTable(doc, y,
      ['Phase', 'Next Steps', 'Risks & Mitigations'],
      handoffRows, [60, 235, 200], 50
    );

    // 4. IBM Solution Proposal Blueprint
    if (y > 640) { doc.addPage(); y = 50; }
    y += 10;
    doc.fillColor('#0f62fe').fontSize(13).font('Helvetica-Bold').text('4. IBM Solution Proposal Blueprint', 50, y);
    y += 18;

    if (proposal.solution_name) {
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(`Solution Name: ${cleanText(proposal.solution_name)}`, 50, y);
      y += 16;
    }

    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('Recommended IBM Stack', 50, y);
    y += 14;

    const stackList = Array.isArray(proposal.recommended_ibm_stack) && proposal.recommended_ibm_stack.length > 0
      ? proposal.recommended_ibm_stack
      : ['IBM Watson IoT', 'IBM Cloud Pak for Data', 'IBM Watson Studio', 'IBM Cloud Pak for Automation', 'Red Hat OpenShift'];

    for (const prod of stackList) {
      doc.fillColor('#0f62fe').fontSize(10).text('•', 56, y);
      doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica-Bold').text(cleanText(prod), 68, y);
      y += 14;
    }
    y += 8;

    if (execSummary) {
      const boxHeight = Math.min(100, Math.max(40, Math.ceil(execSummary.length / 85) * 12 + 14));
      doc.rect(50, y, 495, boxHeight).fill('#eff6ff');
      doc.rect(50, y, 4, boxHeight).fill('#0f62fe');
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica')
        .text(execSummary, 64, y + 8, { width: 468, height: boxHeight - 16, lineGap: 2 });
      y += boxHeight + 14;
    }

    for (const section of proposalSections) {
      if (!section.content || section.content.trim().length < 10) continue;
      if (/executive summary|follow-up|followup|email/i.test(section.title)) continue;

      if (y > 680) { doc.addPage(); y = 50; }
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(section.title, 50, y);
      y += doc.heightOfString(section.title, { width: 495 }) + 8;

      y = renderFormattedPdfContent(doc, section.content, y);
      y += 12;
    }

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
    const rawString = typeof payload === 'string' ? payload : (payload.raw_input || payload.input || payload.deal_context || payload.proposal || JSON.stringify(payload));
    const extracted = extractStructuredFromRawText(rawString);

    if ((payload.raw_input || payload.input || payload.deal_context) && !payload.proposal) {
      console.warn('[pdfRoutes] Missing proposal in payload, using raw_input as deal_context without regeneration');
    }

    const proposal = payload.proposal || {};
    if (extracted.solution_name && (!proposal.solution_name || proposal.solution_name === 'IBM Pre-Sales Solution Proposal' || proposal.solution_name === 'IBM watsonx Enterprise Solution')) {
      proposal.solution_name = extracted.solution_name;
    }
    if (extracted.recommended_ibm_stack && extracted.recommended_ibm_stack.length > 0) {
      proposal.recommended_ibm_stack = extracted.recommended_ibm_stack;
    }
    if (!proposal.solution_name) proposal.solution_name = extracted.solution_name || 'IBM Pre-Sales Solution Proposal';
    if (!proposal.recommended_ibm_stack || proposal.recommended_ibm_stack.length === 0) {
      proposal.recommended_ibm_stack = ['IBM watsonx.ai', 'watsonx Orchestrate', 'Red Hat OpenShift'];
    }

    const handoff = payload.handoff_summary || {
      summary: 'Technical architecture incorporates IBM service integration.',
      next_steps: extracted.next_steps || ['Conduct discovery workshop', 'Provision IBM Cloud sandbox'],
      risks: extracted.risks || ['Data integration latency', 'Change management'],
    };

    const crm = payload.crm_stub || {
      opportunity_name: proposal.solution_name || 'IBM Opportunity',
      account_name: payload.account_name || extracted.account_name || 'Customer Account',
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

    const stackList = Array.isArray(proposal.recommended_ibm_stack) && proposal.recommended_ibm_stack.length > 0
      ? proposal.recommended_ibm_stack
      : ['IBM Watson IoT', 'IBM Cloud Pak for Data', 'IBM Watson Studio', 'IBM Cloud Pak for Automation', 'Red Hat OpenShift'];

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
        spacing: { after: 400 },
      }),

      // 1. CRM Stub
      new Paragraph({
        children: [new TextRun({ text: '1. CRM Opportunity Stub', bold: true, size: 30, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      crmTable,
      new Paragraph({ spacing: { after: 300 } }),

      // 2. Deal Score
      new Paragraph({
        children: [new TextRun({ text: '2. Deal Readiness Score', bold: true, size: 30, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({
          text: `Score: ${deal_score.score || 85} / 100 — ${(deal_score.score || 85) >= 80 ? 'Deal Ready ✓' : 'Promising Opportunity'}`,
          bold: true, size: 24,
          color: (deal_score.score || 85) >= 80 ? '047857' : '1d4ed8',
          font: 'Calibri',
        })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Reasoning: ', bold: true, size: 20, font: 'Calibri', color: DARK }),
          new TextRun({ text: Array.isArray(deal_score.reasoning) ? deal_score.reasoning.join(' ') : 'Deal context fully specified.', size: 20, font: 'Calibri', color: GRAY }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Missing Fields: ', bold: true, size: 20, font: 'Calibri', color: DARK }),
          new TextRun({ text: Array.isArray(deal_score.missing_fields) && deal_score.missing_fields.length > 0 ? deal_score.missing_fields.join(', ') : 'None', size: 20, font: 'Calibri', color: GRAY }),
        ],
        spacing: { after: 240 },
      }),

      // 3. Technical Handoff Summary
      new Paragraph({
        children: [new TextRun({ text: '3. Technical Handoff Summary', bold: true, size: 30, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cleanText(handoff.summary || ''), size: 19, color: GRAY, font: 'Calibri' })],
        spacing: { after: 160 },
      }),
      handoffTable,
      new Paragraph({ spacing: { after: 300 } }),

      // 4. IBM Solution Proposal Blueprint
      new Paragraph({
        children: [new TextRun({ text: '4. IBM Solution Proposal Blueprint', bold: true, size: 30, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { before: 200, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Solution Name: ${cleanText(proposal.solution_name || '')}`, bold: true, size: 24, color: DARK, font: 'Calibri' })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Recommended IBM Stack:', bold: true, size: 22, color: DARK, font: 'Calibri' })],
        spacing: { after: 80 },
      }),
      ...stackList.map((prod: string) => new Paragraph({
        children: [new TextRun({ text: `• ${cleanText(prod)}`, bold: true, size: 20, color: IBM_BLUE, font: 'Calibri' })],
        spacing: { after: 40 },
      })),
      new Paragraph({ spacing: { after: 160 } }),

      ...proposalSections.map(sec => [
        new Paragraph({
          children: [new TextRun({ text: sec.title, bold: true, size: 22, color: DARK, font: 'Calibri' })],
          spacing: { before: 160, after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: cleanText(sec.content).slice(0, 800), size: 19, color: GRAY, font: 'Calibri' })],
          spacing: { after: 120 },
        }),
      ]).flat(),

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
