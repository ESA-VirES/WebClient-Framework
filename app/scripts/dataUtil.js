/* global define _ MASTER_PRIORITY MERGED_MASTER_TIMELINE */
/* common data handling utilities */

define(
  ['globals', 'underscore'],
  function (globals) {
    'use strict';

    function hasMergedMasterTimeline(collection) {
      var index = MERGED_MASTER_TIMELINE.indexOf(collection);
      return index !== -1;
    }

    function getMasterPriority(collection) {
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
        _.each(_.keys(collections), function (sat) {
          // Sort collections by their master collection priority.
          collections[sat].sort(compareMasterPriority);
          // Prepend prepend '-' to merge times for sparse datasets.
          if (
            collections[sat].length > 1 &&
            hasMergedMasterTimeline(collections[sat][0])
          ) {
            collections[sat] = ['-'].concat(collections[sat]);
          }
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
      hasMergedMasterTimeline: hasMergedMasterTimeline,
      compareMasterPriority: compareMasterPriority,
      parseCollections: parseCollections,
      formatCollections: formatCollections
    };
  }
);
