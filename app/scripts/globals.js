/*global define */

define(
  ['backbone', 'objectStore', 'models/MagneticModelCollection', 'models/UserDataCollection'],
  function (Backbone, ObjectStore, MagneticModel, UserDataModel) {

    var swarm_model = Backbone.Model.extend({data: []});
    return {
      version: "3.3.0",
      supportedVersions: ["3.3.0", "3.2.0", "3.1.3", "3.1.2", "3.1.1", "3.1.0"],
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
