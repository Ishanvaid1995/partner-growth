import { Router, Request, Response } from 'express';
import { storageService, SavedConversation } from '../services/storageService';

const router = Router();

function getUserId(req: Request): string | null {
  const token = (req.headers['x-user-id'] || req.headers['authorization']?.replace('Bearer ', '')) as string;
  if (!token || token === 'null' || token === 'undefined' || token === 'guest_user') {
    return null;
  }
  return token;
}

/**
 * GET /api/conversations
 * Returns authenticated user's saved conversations grouped into macOS-style company folders.
 */
router.get('/api/conversations', (req: Request, res: Response): void => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(200).json({ folders: [], totalCount: 0 });
    return;
  }

  const conversations = storageService.getConversations(userId);

  // Group by accountName into macOS-style folder structures
  const folderMap: Record<string, SavedConversation[]> = {};
  conversations.forEach(conv => {
    const folderName = conv.accountName || 'General Accounts';
    if (!folderMap[folderName]) folderMap[folderName] = [];
    folderMap[folderName].push(conv);
  });

  const folders = Object.keys(folderMap).map(accountName => ({
    folderName: accountName,
    count: folderMap[accountName].length,
    conversations: folderMap[accountName],
  }));

  res.status(200).json({ folders, totalCount: conversations.length });
});

/**
 * POST /api/conversations
 * Save a newly completed package into user's company folder.
 */
router.post('/api/conversations', (req: Request, res: Response): void => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(200).json({ status: 'guest', message: 'Guest session not saved to persistent user folders.' });
    return;
  }

  const { account_name, industry, raw_input, packageData } = req.body || {};

  if (!raw_input || !packageData) {
    res.status(400).json({ error: 'Bad Request', message: 'raw_input and packageData are required.' });
    return;
  }

  const saved = storageService.saveConversation(
    userId,
    account_name || 'Customer Account',
    industry || 'general',
    raw_input,
    packageData
  );

  res.status(201).json(saved);
});

/**
 * DELETE /api/conversations/:id
 * Delete a saved conversation session.
 */
router.delete('/api/conversations/:id', (req: Request, res: Response): void => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required to delete sessions.' });
    return;
  }
  const convId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const success = storageService.deleteConversation(userId, convId);
  if (!success) {
    res.status(404).json({ error: 'Not Found', message: 'Conversation session not found.' });
    return;
  }

  res.status(200).json({ status: 'deleted', id: convId });
});

/**
 * DELETE /api/folders/:folderName
 * Delete all saved conversations within a company folder.
 */
router.delete('/api/folders/:folderName', (req: Request, res: Response): void => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required to delete folders.' });
    return;
  }
  const rawFolderName = Array.isArray(req.params.folderName) ? req.params.folderName[0] : req.params.folderName;
  const folderName = decodeURIComponent(rawFolderName);
  const success = storageService.deleteFolder(userId, folderName);
  if (!success) {
    res.status(404).json({ error: 'Not Found', message: 'Folder not found.' });
    return;
  }

  res.status(200).json({ status: 'deleted', folderName });
});

export default router;
