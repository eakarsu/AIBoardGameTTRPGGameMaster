'use strict';
const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const core = require('../featurePack28B');
let ensured = false;
async function ensure() { if (ensured) return; await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS feature_pack_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium', assignee TEXT, related_type TEXT, related_id TEXT, owner TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`); ensured = true; }
const store = {
  async list(owner) { await ensure(); return prisma.$queryRawUnsafe('SELECT * FROM feature_pack_tasks WHERE owner=$1 ORDER BY created_at DESC', owner); },
  async create(d) { await ensure(); const id = crypto.randomUUID(); await prisma.$executeRawUnsafe(`INSERT INTO feature_pack_tasks (id,title,description,status,priority,assignee,related_type,related_id,owner) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, id, d.title, d.description||null, d.status||'todo', d.priority||'medium', d.assignee||null, d.related_type||null, d.related_id||null, d.owner); const rows = await prisma.$queryRawUnsafe('SELECT * FROM feature_pack_tasks WHERE id=$1', id); return rows[0]; },
  async update(id, d, owner) { await ensure(); const cur = await prisma.$queryRawUnsafe('SELECT * FROM feature_pack_tasks WHERE id=$1 AND owner=$2', id, owner); if (!cur[0]) return null; const m = { ...cur[0], ...d }; await prisma.$executeRawUnsafe(`UPDATE feature_pack_tasks SET title=$1,description=$2,status=$3,priority=$4,assignee=$5,related_type=$6,related_id=$7,updated_at=NOW() WHERE id=$8 AND owner=$9`, m.title, m.description, m.status, m.priority, m.assignee, m.related_type, m.related_id, id, owner); const rows = await prisma.$queryRawUnsafe('SELECT * FROM feature_pack_tasks WHERE id=$1', id); return rows[0]; },
};
async function listMainRecords(req) {
  return prisma.campaign.findMany({ where: { OR: [{ gmId: req.user.id }, { players: { some: { userId: req.user.id } } }] }, orderBy: { updatedAt: 'desc' }, take: 5000 });
}
module.exports = core.createFeaturePackRouter({ auth: authenticate, store, listMainRecords, aiFeatures: core.AI_FEATURES, mainName: 'campaigns', exportFilename: 'campaigns', searchFields: ['name','description','genre','system','setting'], filterFields: ['status','genre','system'] });
module.exports.store = store; module.exports.listMainRecords = listMainRecords;
