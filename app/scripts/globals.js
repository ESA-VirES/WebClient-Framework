/*global define */

define(
  ['backbone', 'objectStore', 'models/MagneticModelCollection', 'models/UserDataCollection'],
  function (Backbone, ObjectStore, MagneticModel, UserDataModel) {

    var swarm_model = Backbone.Model.extend({data: []});
    return {
      version: "3.1.1",
      supportedVersions: ["3.1.0", "3.1.1"],
      objects: new ObjectStore(),
      selections: new ObjectStore(),
      baseLayers: new Backbone.Collection(),
      products: new Backbone.Collection(),
      overlays: new Backbone.Collection(),
      swarm: new swarm_model(),
      models: new MagneticModel.MagneticModelCollection(),
      userData: new UserDataModel.UserDataCollection(),
    };
  }
);
