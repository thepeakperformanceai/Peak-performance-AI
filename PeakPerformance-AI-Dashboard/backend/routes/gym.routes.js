const router = require('express').Router();
const { createMember, getMembers, getMemberDetail, getSquadComparison, deleteMember, changeMemberPassword } = require('../controllers/gym.controller');
const { protect, gymOwnerOnly } = require('../middleware/auth.middleware');

router.use(protect, gymOwnerOnly);
router.post('/members', createMember);
router.get('/members', getMembers);
router.get('/squad-comparison', getSquadComparison);
router.get('/members/:id', getMemberDetail);
router.delete('/members/:id', deleteMember);
router.patch('/members/:id/password', changeMemberPassword);

module.exports = router;