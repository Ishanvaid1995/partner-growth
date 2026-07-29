import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { watsonxService } from '../services/watsonxService';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// Ensure public/downloads directory exists
const downloadsDir = fs.existsSync(path.join(__dirname, '../../public/downloads'))
  ? path.join(__dirname, '../../public/downloads')
  : path.join(process.cwd(), 'public/downloads');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Cleanup downloads older than 60 minutes
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
  return String(text)
    .replace(/<[^>]*>/g, '') // Strip HTML tags completely
    .replace(/^#+\s*/gm, '') // Remove heading tags
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold asterisks
    .replace(/\*(.*?)\*/g, '$1') // Remove italic asterisks
    .replace(/\\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Helper to draw executive tables with vector borders & headers
 */
function drawPdfTable(
  doc: typeof PDFDocument.prototype,
  startY: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  startX: number = 50
) {
  let currentY = startY;

  // Header Row Height Calculation
  doc.font('Helvetica-Bold').fontSize(9.5);
  let maxHeaderHeight = 0;
  headers.forEach((header, i) => {
    const h = doc.heightOfString(header, { width: colWidths[i] - 16 }) + 14;
    if (h > maxHeaderHeight) maxHeaderHeight = h;
  });
  const headerHeight = Math.max(24, maxHeaderHeight);

  // Helper to draw headers
  const renderHeader = (yPos: number) => {
    doc.rect(startX, yPos, colWidths.reduce((a, b) => a + b, 0), headerHeight).fill('#0f62fe');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5);
    let cx = startX;
    headers.forEach((header, i) => {
      doc.text(header, cx + 8, yPos + 7, { width: colWidths[i] - 16, align: 'left' });
      cx += colWidths[i];
    });
  };

  // Draw Initial Header
  if (currentY > 700) {
    doc.addPage();
    currentY = 50;
  }
  renderHeader(currentY);
  currentY += headerHeight;

  // Data Rows
  rows.forEach((row, rowIndex) => {
    doc.font('Helvetica').fontSize(9);
    let maxCellHeight = 0;
    row.forEach((cell, colIndex) => {
      const h = doc.heightOfString(cleanText(cell), { width: colWidths[colIndex] - 16 }) + 14;
      if (h > maxCellHeight) maxCellHeight = h;
    });
    const rowHeight = Math.max(24, maxCellHeight);

    // Page Break check
    if (currentY + rowHeight > 730) {
      doc.addPage();
      currentY = 50;
      renderHeader(currentY);
      currentY += headerHeight;
    }

    const bg = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(bg);
    doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    doc.fillColor('#1e293b').font('Helvetica').fontSize(9);
    let currentX = startX;
    row.forEach((cell, colIndex) => {
      doc.text(cleanText(cell), currentX + 8, currentY + 7, { width: colWidths[colIndex] - 16, align: 'left' });
      currentX += colWidths[colIndex];
    });

    currentY += rowHeight;
  });

  return currentY + 10;
}

/**
 * GET /downloads/:filename
 * Serves generated PDF files directly.
 */
router.get('/downloads/:filename', (req: Request, res: Response): void => {
  cleanupOldDownloads();
  const rawName = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filename = path.basename(rawName);
  const filePath = path.join(downloadsDir, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Not Found', message: 'PDF file expired or not found.' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Partner_Growth_Package_${filename}"`);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

/**
 * POST /api/generate-pdf
 * Generates a styled PDF of the full opportunity package (WITHOUT Email section) with high-quality tables.
 */
router.post(
  '/api/generate-pdf',
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      cleanupOldDownloads();
      let payload = req.body || {};

      // If raw_input is provided without package sections, generate full package on the fly
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
        missing_fields: ['Formal RFP release date', 'Budget procurement sign-off'],
        next_best_actions: ['Schedule Architecture Review', 'Deliver Pilot Proposal'],
      };

      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        const fileName = `partner-growth-package-${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pdf`;
        const filePath = path.join(downloadsDir, fileName);

        fs.writeFileSync(filePath, pdfBuffer);

        // Absolute URL construction
        const PRODUCTION_CODEENGINE_URL = 'https://partner-growth.2csujuhkf3ha.ca-tor.codeengine.appdomain.cloud';
        let baseUrl = process.env.PUBLIC_APP_URL || process.env.CODEENGINE_APP_URL || process.env.HOST_URL;
        
        if (!baseUrl) {
          const rawHost = ((req.headers['x-forwarded-host'] || req.get('host') || '') as string).trim();
          if (rawHost && !rawHost.includes('example.com') && !rawHost.includes('files.')) {
            const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
            const finalProto = rawHost.includes('localhost') ? (rawProto.startsWith('https') ? 'https' : 'http') : 'https';
            baseUrl = `${finalProto}://${rawHost}`;
          } else {
            baseUrl = PRODUCTION_CODEENGINE_URL;
          }
        }

        baseUrl = baseUrl.replace(/\/+$/, '');

        const download_url = `${baseUrl}/downloads/${fileName}`;
        const download_markdown = `[Download ${fileName}](${download_url})`;
        const display_message = `Your PDF package is ready. Direct Download URL: ${download_url}`;

        res.status(200).json({
          success: true,
          file_name: fileName,
          download_url,
          display_message,
          download_markdown,
          expires_in_minutes: 60,
          summary: 'Executive PDF package generated successfully with tables and vector graphics.',
        });
      });

      // -- Executive Top Banner --
      doc.rect(0, 0, 595, 70).fill('#0f62fe');
      doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
        .text('Partner Growth Copilot', 50, 20);
      doc.fillColor('#dbeafe').fontSize(10).font('Helvetica')
        .text('IBM Enterprise Pre-Sales Solution Package', 50, 44);
      doc.fillColor('#93c5fd').fontSize(9).font('Helvetica')
        .text('Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), 430, 44, { align: 'right' });

      let y = 90;

      // -- SECTION 1: IBM SOLUTION PROPOSAL --
      doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('1. IBM Solution Proposal', 50, y);
      y += 22;

      if (proposal.solution_name) {
        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(cleanText(proposal.solution_name), 50, y);
        y += 18;
      }

      // Executive Summary Card Box
      const summaryText = cleanText(typeof proposal.proposal === 'string' ? proposal.proposal : JSON.stringify(proposal.proposal));
      const boxHeight = Math.min(100, Math.max(50, Math.ceil(summaryText.length / 80) * 14 + 16));
      
      doc.rect(50, y, 495, boxHeight).fill('#f1f5f9');
      doc.rect(50, y, 4, boxHeight).fill('#0f62fe'); // Blue accent bar
      doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica').text(summaryText, 64, y + 10, { width: 470, height: boxHeight - 20, lineGap: 3 });

      y += boxHeight + 20;

      // Table 1: Stack & Value Drivers
      const stackStr = Array.isArray(proposal.recommended_ibm_stack) ? proposal.recommended_ibm_stack.join(', ') : 'IBM watsonx.ai, watsonx Orchestrate';
      const outcomesStr = Array.isArray(proposal.business_outcomes) ? proposal.business_outcomes.join(', ') : 'Optimized inventory, reduced stockouts';

      y = drawPdfTable(
        doc,
        y,
        ['Architecture Layer', 'IBM Technology / Capability', 'Target Business Value'],
        [
          ['AI & Analytics', stackStr, outcomesStr],
          ['Orchestration', 'watsonx Orchestrate Agent', 'Automated workflow execution & CRM sync'],
          ['Platform & Cloud', 'Red Hat OpenShift', 'Hybrid cloud deployment & security governance'],
        ],
        [120, 200, 175],
        50
      );

      // -- SECTION 2: TECHNICAL HANDOFF SUMMARY --
      y += 10;
      doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('2. Technical Handoff & Implementation', 50, y);
      y += 22;

      if (handoff_summary.summary) {
        doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica').text(cleanText(handoff_summary.summary), 50, y, { width: 495, lineGap: 3 });
        y += doc.heightOfString(cleanText(handoff_summary.summary), { width: 495 }) + 14;
      }

      // Table 2: Implementation Roadmap & Risks
      const steps = Array.isArray(handoff_summary.next_steps) ? handoff_summary.next_steps : ['Conduct discovery workshop'];
      const risks = Array.isArray(handoff_summary.risks) ? handoff_summary.risks : ['Data integration latency'];

      const handoffRows: string[][] = [];
      const maxRows = Math.max(steps.length, risks.length);
      for (let i = 0; i < maxRows; i++) {
        handoffRows.push([
          `Phase ${i + 1}`,
          steps[i] || '—',
          risks[i] || 'Standard risk controls applied',
        ]);
      }

      y = drawPdfTable(
        doc,
        y,
        ['Milestone', 'Implementation Action Step', 'Risk & Mitigation Strategy'],
        handoffRows,
        [80, 215, 200],
        50
      );

      // Check for Page Break for CRM & Scorecard
      if (y > 680) {
        doc.addPage();
        y = 50;
      }

      // -- SECTION 3: CRM OPPORTUNITY RECORD (Table) --
      y += 10;
      doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('3. CRM Opportunity Summary Record', 50, y);
      y += 22;

      y = drawPdfTable(
        doc,
        y,
        ['CRM Field Key', 'Opportunity Record Details'],
        [
          ['Opportunity Name', crm_stub.opportunity_name || proposal.solution_name || 'IBM Pre-Sales Opportunity'],
          ['Account Name', crm_stub.account_name || payload.account_name || 'Customer Account'],
          ['Sales Stage', crm_stub.stage || 'Qualification'],
          ['Contract Value', crm_stub.estimated_value || '$150,000 USD'],
          ['Opportunity Notes', crm_stub.notes || 'Pre-sales opportunity created by Partner Growth Copilot.'],
        ],
        [150, 345],
        50
      );

      // -- SECTION 4: DEAL READINESS EVALUATION --
      y += 10;
      doc.fillColor('#0f62fe').fontSize(14).font('Helvetica-Bold').text('4. Deal Readiness Evaluation & Scorecard', 50, y);
      y += 22;

      // Score Badge Box
      const score = deal_score.score || 85;
      const badgeBg = score >= 80 ? '#ecfdf5' : score >= 60 ? '#eff6ff' : '#fffbe completed';
      const badgeText = score >= 80 ? '#047857' : score >= 60 ? '#1d4ed8' : '#b45309';

      doc.rect(50, y, 495, 36).fill(badgeBg);
      doc.rect(50, y, 495, 36).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.fillColor(badgeText).fontSize(14).font('Helvetica-Bold')
        .text(`Readiness Score: ${score}/100 — ${score >= 80 ? 'Deal Ready' : 'Promising Opportunity'}`, 64, y + 10);

      y += 50;

      const missing = Array.isArray(deal_score.missing_fields) ? deal_score.missing_fields.join('; ') : 'None identified';
      const actions = Array.isArray(deal_score.next_best_actions) ? deal_score.next_best_actions.join('; ') : 'Schedule architecture review';

      y = drawPdfTable(
        doc,
        y,
        ['Evaluation Metric', 'Details & Strategic Recommendations'],
        [
          ['Missing Information', missing],
          ['Recommended Next Actions', actions],
        ],
        [150, 345],
        50
      );

      // -- Footers on all pages --
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
          .text(`Partner Growth Copilot | Page ${i + 1} of ${pageCount} | Executive PDF Package | Powered by IBM watsonx.ai & watsonx Orchestrate`,
            50, 780, { align: 'center', width: 495 });
      }

      doc.end();
    } catch (err: any) {
      console.error('[pdfRoutes Error]', err);
      res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'PDF generation failed.' });
    }
  }
);

export default router;
