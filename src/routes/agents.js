'use strict';

const agentsController = require('../controllers/agentsController');
const express = require('express');
const router = express.Router();

router.get('/', agentsController.listAgents);
router.get('/:id', agentsController.getAgent);
router.post('/:id/run', agentsController.runAgent);
router.delete('/:id/stop', agentsController.stopAgent);

module.exports = router;
