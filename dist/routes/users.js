"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserRepository_1 = require("../repository/UserRepository");
const phoneUtils_1 = require("../utils/phoneUtils");
const router = (0, express_1.Router)();
const userRepo = new UserRepository_1.UserRepository();
router.post('/contacts', async (req, res) => {
    try {
        const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
        const users = await userRepo.getUsersByIds(userIds);
        const contacts = users.map((user) => ({
            userId: user._id.toString(),
            name: user.name || '',
            email: user.email || '',
            whatsappNumber: (0, phoneUtils_1.normalizeIndianMobile)(user.whatsappNumber || user.mobile),
        }));
        const response = {
            success: true,
            data: contacts,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching user contacts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user contacts',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Query must be at least 2 characters',
                timestamp: new Date().toISOString(),
            });
        }
        const users = await userRepo.searchUsers(query);
        const response = {
            success: true,
            data: users,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search users',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await userRepo.getUserById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                timestamp: new Date().toISOString(),
            });
        }
        const response = {
            success: true,
            data: user,
            timestamp: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user',
            timestamp: new Date().toISOString(),
        });
    }
});
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 50;
        const userType = req.query.userType;
        const state = req.query.state;
        let filter = {};
        if (userType) {
            filter.type = userType;
        }
        if (state) {
            filter.state = state;
        }
        const { users, total } = await userRepo.getUsersWithPagination(filter, page, pageSize);
        const response = {
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
    }
    catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map