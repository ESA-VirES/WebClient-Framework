/* global define _ MASTER_PRIORITY */
/* common data handling utilities */

define(
  ['globals', 'underscore'],
  function (globals) {

    function getMasterPriority(collection) {
      'use strict';
      var index = MASTER_PRIORITY.indexOf(collection);
      return index !== -1 ? index : MASTER_PRIORITY.length;
    }

    function compareMasterPriority(collectionA, collectionB) {
      return getMasterPriority(collectionA) - getMasterPriority(collectionB);
    }

    function parseCollections(retrieve_data)
    {
      var collections = {};

      if (retrieve_data.length > 0) {
        _.each(retrieve_data, function (data) {
          var collection = data.layer;
          var sat = globals.swarm.collection2satellite[collection];
          if (sat) {
            if (!collections.hasOwnProperty(sat)) {
              collections[sat] = [];
            }
            collections[sat].push(collection);
          }
        });
        // Sort collections by their master collection priority.
        _.each(_.keys(collections), function (sat) {
          collections[sat].sort(compareMasterPriority);
        });
      }

      return collections;
    }

    function formatCollections(collections)
    {
      return JSON.stringify(collections, Object.keys(collections).sort());
    }

    return {
      getMasterPriority: getMasterPriority,
      compareMasterPriority: compareMasterPriority,
      parseCollections: parseCollections,
      formatCollections: formatCollections
    };
  }
);
