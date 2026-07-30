import { Router, Request, Response } from 'express';
import { UserRepository } from '../repository/UserRepository';
import { APIResponse, PaginatedResponse, User } from '../types';

const router = Router();
const userRepo = new UserRepository();

router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 2 characters',
        timestamp: new Date().toISOString(),
      } as APIResponse<null>);
    }

    const users = await userRepo.searchUsers(query);

    const response: APIResponse<User[]> = {
      success: true,
      data: users,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search users',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const user = await userRepo.getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      } as APIResponse<null>);
    }

    const response: APIResponse<User> = {
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const userType = req.query.userType as string;
    const state = req.query.state as string;

    let filter: Record<string, unknown> = {};

    if (userType) {
      filter.type = userType;
    }
    if (state) {
      filter.state = state;
    }

    const { users, total } = await userRepo.getUsersWithPagination(filter, page, pageSize);

    const response: APIResponse<PaginatedResponse<User>> = {
      success: true,
      data: {
        items: users,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      timestamp: new Date().toISOString(),
    } as APIResponse<null>);
  }
});

export default router;
