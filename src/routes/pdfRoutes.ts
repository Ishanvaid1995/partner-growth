import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
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

function cleanMarkdownForPdf(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#+\s*/gm, '') // Remove heading tags
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold asterisks
    .replace(/\*(.*?)\*/g, '$1') // Remove italic asterisks
    .replace(/\\n/g, '\n')
    .trim();
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
 * Generates a styled PDF of the full opportunity package and returns JSON download metadata for watsonx Orchestrate.
 */
router.post(
  '/api/generate-pdf',
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      cleanupOldDownloads();
      const { proposal, followup_email, handoff_summary, crm_stub, deal_score } = req.body || {};

      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        const fileName = `partner-growth-package-${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pdf`;
        const filePath = path.join(downloadsDir, fileName);

        fs.writeFileSync(filePath, pdfBuffer);

        // Absolute URL construction for IBM Code Engine and local environments
        let baseUrl = process.env.PUBLIC_APP_URL || process.env.CODEENGINE_APP_URL || process.env.HOST_URL;
        
        if (!baseUrl) {
          const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
          const proto = rawProto.startsWith('https') ? 'https' : 'http';
          const rawHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'partner-growth.2csujuhkf3ha.ca-tor.codeengine.appdomain.cloud';
          
          // Force https if domain is an appdomain.cloud or external host
          const finalProto = rawHost.includes('localhost') ? proto : 'https';
          baseUrl = `${finalProto}://${rawHost}`;
        }

        // Ensure no trailing slash on baseUrl
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
          summary: 'PDF package generated successfully. Direct download link generated.',
        });
      });

      // -- Cover Header --
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#0f62fe')
        .text('Partner Growth Copilot', { align: 'left' });
      doc.fontSize(12).font('Helvetica').fillColor('#475569')
        .text('IBM Enterprise Pre-Sales Solution Package', { align: 'left' });
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor('#94a3b8')
        .text('Generated on: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }));

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#0f62fe').lineWidth(1.5).stroke();
      doc.moveDown(1);

      // -- 1. Solution Proposal --
      if (proposal) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f62fe').text('1. IBM Solution Proposal');
        doc.moveDown(0.3);
        if (proposal.solution_name) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text(cleanMarkdownForPdf(proposal.solution_name));
          doc.moveDown(0.2);
        }
        if (proposal.recommended_ibm_stack && Array.isArray(proposal.recommended_ibm_stack)) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569')
            .text('Recommended IBM Stack: ', { continued: true })
            .font('Helvetica').text(proposal.recommended_ibm_stack.join(' · '));
          doc.moveDown(0.3);
        }
        const proposalText = typeof proposal.proposal === 'string' ? proposal.proposal : JSON.stringify(proposal.proposal);
        doc.fontSize(10).font('Helvetica').fillColor('#1e293b')
          .text(cleanMarkdownForPdf(proposalText), { align: 'left', lineGap: 3 });
        doc.moveDown(1.5);
      }

      // -- 2. Customer Follow-Up Email --
      if (followup_email) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f62fe').text('2. Customer Follow-Up Email');
        doc.moveDown(0.3);
        if (followup_email.subject) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
            .text('Subject: ' + cleanMarkdownForPdf(followup_email.subject));
          doc.moveDown(0.3);
        }
        const emailText = typeof followup_email.email_body === 'string' ? followup_email.email_body : '';
        doc.fontSize(10).font('Helvetica').fillColor('#1e293b')
          .text(cleanMarkdownForPdf(emailText), { align: 'left', lineGap: 3 });
        doc.moveDown(1.5);
      }

      // -- 3. Technical Handoff Summary --
      if (handoff_summary) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f62fe').text('3. Technical Handoff Summary');
        doc.moveDown(0.3);
        if (handoff_summary.summary) {
          doc.fontSize(10).font('Helvetica').fillColor('#1e293b').text(cleanMarkdownForPdf(handoff_summary.summary), { lineGap: 3 });
          doc.moveDown(0.4);
        }
        if (Array.isArray(handoff_summary.next_steps) && handoff_summary.next_steps.length > 0) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Next Implementation Steps:');
          handoff_summary.next_steps.forEach((step: string) => {
            doc.fontSize(10).font('Helvetica').fillColor('#475569').text('  • ' + cleanMarkdownForPdf(step));
          });
          doc.moveDown(0.3);
        }
        if (Array.isArray(handoff_summary.risks) && handoff_summary.risks.length > 0) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Identified Risks & Mitigation:');
          handoff_summary.risks.forEach((risk: string) => {
            doc.fontSize(10).font('Helvetica').fillColor('#475569').text('  • ' + cleanMarkdownForPdf(risk));
          });
        }
        doc.moveDown(1.5);
      }

      // -- 4. CRM Opportunity --
      if (crm_stub) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f62fe').text('4. CRM Opportunity Record');
        doc.moveDown(0.3);
        const fields = [
          ['Opportunity Title', crm_stub.opportunity_name],
          ['Account Name', crm_stub.account_name],
          ['Deal Stage', crm_stub.stage || 'Qualification'],
          ['Estimated Value', crm_stub.estimated_value],
        ];
        fields.forEach(([label, value]) => {
          if (value) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#475569').text(label + ': ', { continued: true });
            doc.font('Helvetica').fillColor('#0f172a').text(cleanMarkdownForPdf(value));
          }
        });
        if (crm_stub.notes) {
          doc.moveDown(0.2);
          doc.fontSize(10).font('Helvetica').fillColor('#475569').text('Opportunity Notes: ' + cleanMarkdownForPdf(crm_stub.notes));
        }
        doc.moveDown(1.5);
      }

      // -- 5. Deal Score --
      if (deal_score) {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f62fe').text('5. Deal Readiness Evaluation');
        doc.moveDown(0.3);
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a')
          .text(`Readiness Score: ${deal_score.score || 0}/100`);
        doc.moveDown(0.3);
        if (Array.isArray(deal_score.missing_fields) && deal_score.missing_fields.length > 0) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('Missing Key Data Points:');
          deal_score.missing_fields.forEach((f: string) => {
            doc.fontSize(10).font('Helvetica').fillColor('#475569').text('  • ' + cleanMarkdownForPdf(f));
          });
        }
      }

      // -- Footer on all pages --
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
          .text(`Partner Growth Copilot | Page ${i + 1} of ${pageCount} | Powered by IBM watsonx.ai & watsonx Orchestrate`,
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
