function getCachedProducts() { return []; }
function setCachedProducts() { return true; }
function saveSaleLocally() { return { id: 0, local_ref: 'STUB', items: [] }; }
function getPendingSales() { return []; }
function markSaleSynced() {}
function getPendingSyncCount() { return 0; }

module.exports = {
  getCachedProducts,
  setCachedProducts,
  saveSaleLocally,
  getPendingSales,
  markSaleSynced,
  getPendingSyncCount,
};
