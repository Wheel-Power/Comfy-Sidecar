'use strict';

/**
 * In-memory agent registry. In production this should be backed by persistent
 * storage or service discovery.
 */
const agents = new Map([
  ['openclaw', { id: 'openclaw', name: 'OpenClaw', status: 'idle' }],
  ['ant', { id: 'ant', name: 'Ant', status: 'idle' }],
]);

function listAgents(req, res) {
  res.json({ agents: Array.from(agents.values()) });
}

function getAgent(req, res) {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: `Agent '${req.params.id}' not found` });
  }
  res.json(agent);
}

function runAgent(req, res) {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: `Agent '${req.params.id}' not found` });
  }
  if (agent.status === 'running') {
    return res.status(409).json({ error: `Agent '${req.params.id}' is already running` });
  }
  agent.status = 'running';
  agents.set(agent.id, agent);
  res.json({ message: `Agent '${agent.id}' started`, agent });
}

function stopAgent(req, res) {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: `Agent '${req.params.id}' not found` });
  }
  if (agent.status !== 'running') {
    return res.status(409).json({ error: `Agent '${req.params.id}' is not running` });
  }
  agent.status = 'idle';
  agents.set(agent.id, agent);
  res.json({ message: `Agent '${agent.id}' stopped`, agent });
}

module.exports = { listAgents, getAgent, runAgent, stopAgent };
