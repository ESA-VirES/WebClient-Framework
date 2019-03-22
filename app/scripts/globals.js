
// globals
define(
  ['backbone', 'objectStore', 'models/MagneticModelCollection'],
  function (Backbone, ObjectStore, MagneticModel) {

    var swarm_model = Backbone.Model.extend({data:[]});
    return {
        version: "2.3.1",
        objects: new ObjectStore(),
        selections: new ObjectStore(),
        baseLayers: new Backbone.Collection(),
        products: new Backbone.Collection(),
        overlays: new Backbone.Collection(),
        swarm: new swarm_model(),
        models: new MagneticModel.MagneticModelCollection()
    }
});
