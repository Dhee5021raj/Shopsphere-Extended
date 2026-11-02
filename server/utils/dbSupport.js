'use strict';
const mongoose = require('mongoose');

/**
 * Accurately determines if the active MongoDB deployment supports multi-document ACID transactions.
 * Transactions strictly require a replica set (ReplicaSetWithPrimary) or a sharded cluster (Sharded).
 * Standalone instances ('Single') do NOT support transactions and will throw if txnNumber is sent.
 */
const checkTransactionSupport = () => {
  try {
    const topology = mongoose.connection?.client?.topology;
    const desc = topology?.description;
    const type = desc?.type;
    const setName = desc?.setName;

    if (type === 'ReplicaSetWithPrimary' || type === 'Sharded' || Boolean(setName)) {
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
};

module.exports = { checkTransactionSupport };
