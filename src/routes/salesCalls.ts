import { Router, Request, Response } from 'express';
import { ZohoCrmService } from '../services/ZohoCrmService';
import { APIResponse } from '../types';
import { getDateRange, getCustomDateRange } from '../utils/dateUtils';

const router = Router();
const zohoCrmService = new ZohoCrmService();

function resolveRange(req: Request): { startDate: Date; endDate: Date } {
  const startDateParam = req.query.startDate as string;
  const endDateParam = req.query.endDate as string;
  const period = (req.query.period as string) || 'thisMonth';

  return startDateParam && endDateParam ? getCustomDateRange(startDateParam, endDateParam) : getDateRange(period);
}

function resolveAgents(req: Request): string[] | undefined {
  const raw = req.query.agents as string | undefined;
  if (!raw) return undefined;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function resolvePage(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
  return { page, pageSize };
}

router.get('/filters', async (_req: Request, res: Response) => {
  try {
    const data = await zohoCrmService.getFilterOptions();
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching Zoho filter options:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch filter options',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/calls-overview', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = resolveRange(req);
    const agents = resolveAgents(req);
    const leadSource = req.query.leadSource as string | undefined;

    const data = await zohoCrmService.getCallsOverview(startDate, endDate, agents, leadSource);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching Zoho calls overview:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch calls overview',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/leads-overview', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = resolveRange(req);
    const agents = resolveAgents(req);
    const leadSource = req.query.leadSource as string | undefined;

    const data = await zohoCrmService.getLeadsOverview(startDate, endDate, agents, leadSource);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching Zoho leads overview:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch leads overview',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/call-records', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = resolveRange(req);
    const agents = resolveAgents(req);
    const leadSource = req.query.leadSource as string | undefined;
    const { page, pageSize } = resolvePage(req);

    const data = await zohoCrmService.getCallRecords(startDate, endDate, agents, leadSource, page, pageSize);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching Zoho call records:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch call records',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/lead-records', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = resolveRange(req);
    const agents = resolveAgents(req);
    const leadSource = req.query.leadSource as string | undefined;
    const { page, pageSize } = resolvePage(req);

    const data = await zohoCrmService.getLeadRecords(startDate, endDate, agents, leadSource, page, pageSize);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching Zoho lead records:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch lead records',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/lead-history', async (req: Request, res: Response) => {
  try {
    const leadId = req.query.leadId as string;
    if (!leadId) {
      res.status(400).json({ success: false, error: 'leadId is required', timestamp: new Date().toISOString() } as APIResponse<null>);
      return;
    }

    const data = await zohoCrmService.getLeadHistory(leadId);
    res.json({ success: true, data, timestamp: new Date().toISOString() } as APIResponse<any>);
  } catch (error) {
    console.error('Error fetching Zoho lead history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch lead history',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
