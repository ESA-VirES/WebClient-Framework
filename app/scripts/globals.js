/*global define _ */

define(
  [
    'backbone',
    'objectStore',
    'models/MagneticModelCollection',
    'models/UserDataCollection',
    'underscore',
  ],
  function (Backbone, ObjectStore, MagneticModel, UserDataModel) {

    var SwarmModel = Backbone.Model.extend({
      defaults: {
        data: null,
        relatedData: new Backbone.Model(),
        sources: [],
        filters: {},
      },
      clearSources: function () {
        this.set('sources', []);
      },
      appendSources: function (sources) {
        sources = [].concat(this.get('sources') || [], sources || []);
        sources.sort();
        this.set('sources', _.unique(sources, true));
      },
    });

    return {
      version: "3.13.2",
      supportedVersions: [
        "3.13.2", "3.13.1", "3.13.0",
        "3.12.0", "3.11.0", "3.10.0", "3.9.0", "3.8.0", "3.7.0", "3.6.0",
        "3.5.0", "3.4.0", "3.3.0", "3.2.0", "3.1.3", "3.1.2", "3.1.1", "3.1.0"
      ],
      objects: new ObjectStore(),
      selections: new ObjectStore(),
      baseLayers: new Backbone.Collection(),
      products: new Backbone.Collection(),
      overlays: new Backbone.Collection(),
      swarm: new SwarmModel(),
      models: new MagneticModel.MagneticModelCollection(),
      userData: new UserDataModel.UserDataCollection(),
      download: new Backbone.Model(),
    };
  }
);
