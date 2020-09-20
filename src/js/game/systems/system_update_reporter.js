"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemUpdateReporter = void 0;
const utils_1 = require("../../core/utils");
const item_acceptor_1 = require("../components/item_acceptor");
const item_ejector_1 = require("../components/item_ejector");
const item_processor_1 = require("../components/item_processor");
const storage_1 = require("../components/storage");
const underground_belt_1 = require("../components/underground_belt");
const game_system_with_filter_1 = require("../game_system_with_filter");
// TODO object docs
// TODO CHECK LOGIC WIRES ISSUES
/**
 * If an entity is idle for this many frames, deactivate all of its components
 * => frame based to scale by target performance, lower targeted simulation tick
 *      should probably take a bit slower to perform the idle process
 */
const ENTITY_IDLE_AFTER_FRAMES = 150;
// /**
//  * @typedef {Object} Dep
//  * @property {EntityUid} effected
//  * @property {number} idleTime
//  * @property {boolean} idled
//  */
// interface Dep {
//     effectedEntity: Entity | BeltPathFwd;
//     idleTime: number;
//     idled: boolean;
// }
///////////////////////////////////////////////////////////////////////////
//                                                                       //
// THIS SYSTEM IS BASED ON THREE VERY IMPORTANT THINGS SO I MUST SCREAM  //
//                                                                       //
//  1. IDLE BELTPATHS CAN BE RESOLVED BY THE BELTPATH ITEM ACCEPTOR AND  //
//      COMPONENT BASED CHANGES                                          //
//  2. IDLE ENTITIES WITH ITEM ACCEPTORS ARE RESOLVED BY ITEM ACCEPTOR   //
//      BASED CHANGES                                                    //
//  3. IDLE ENTITIES WITH ITEM EJECTORS ARE RESOLVED BY A effected      //
//          ENTITY'S ITEM ACCEPTOR CHANGES                               //
//                                                                       //
// IN OTHER WORDS, THIS IS ALL effected ON AUTONOMOUS CHANGES TO ITEM   //
//      ACCEPTOR COMPONENTS                                              //
//                                                                       //
///////////////////////////////////////////////////////////////////////////
/**
 * Holds onto any updates that
 */
class SystemUpdateReporter extends game_system_with_filter_1.GameSystemWithFilter {
    constructor(root) {
        super(root, [
            item_acceptor_1.ItemAcceptorComponent,
            item_ejector_1.ItemEjectorComponent,
            item_processor_1.ItemProcessorComponent,
            storage_1.StorageComponent,
            underground_belt_1.UndergroundBeltComponent,
        ]);
        //  /**
        //   * @type {Map<ComponentId, EntityUid>}
        //   */
        this.entityComponentContainers = new Map();
        // depUid: [effectedEntities]
        // contains all entities (idled or not) that are effected on another entity's update
        this.depMap = new Map();
        // queue to determine who is added to map (some entities are removed during updates)
        this.depQueueMap = new Map();
        // all entities that have been idled (removed from updates);
        this.idleEntitySet = new Set();
        // all entities that are awaiting idled, Entity: Frames
        this.idleEntityQueueMap = new Map();
        // all depedencies queued to be resolved
        this.depResolveQueue = [];
        this.beltPaths = {
            container: {
                activeEntitySet: new Set(),
                activeEntityArray: [],
                activateEntityQueue: [],
                deactivateEntityQueue: [],
            },
            allBeltPaths: new Map(),
        };
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            const container = {
                activeEntitySet: new Set(),
                activeEntityArray: [],
                activateEntityQueue: [],
                deactivateEntityQueue: [],
            };
            this.entityComponentContainers[this.requiredComponentIds[i]] = container;
        }
    }
    acceptSystemUpdateResolver(resolver) {
        super.acceptSystemUpdateResolver(resolver);
        resolver.provideReporter(this);
    }
    addToRelevantQueues(addEntity, listKey) {
        const entityComponents = addEntity.components;
        if (!entityComponents) {
            this.beltPaths.container[listKey].push(addEntity.uid);
            return;
        }
        const entity = addEntity;
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            try {
                if (entity.components[this.requiredComponentIds[i]] != null) {
                    const container = this.entityComponentContainers[this.requiredComponentIds[i]];
                    container[listKey].push(entity.uid);
                }
            }
            catch (e) {
                console.log("something went wrong!");
                console.dir(e);
                console.dir(entity);
            }
        }
    }
    deactivateRequiredComponents(entity) {
        this.addToRelevantQueues(entity, "deactivateEntityQueue");
    }
    activateRequiredComponents(entity) {
        this.addToRelevantQueues(entity, "activateEntityQueue");
    }
    ////////////////// Entities and Updates ///////////////
    /**
     * @param {string} componentId
     * @returns {Array<EntityUid>}
     */
    getActiveEntitiesByComponent(componentId) {
        return this.entityComponentContainers[componentId].activeEntityArray;
    }
    queueNewDep(effectedEntity, depUid) {
        if (this.depMap.has(depUid) && this.depMap.get(depUid).has(depUid)) {
            return; // quick escape
        }
        const dset = this.depQueueMap.get(depUid);
        if (dset)
            dset.add(depUid);
        else
            this.depQueueMap.set(depUid, new Set([effectedEntity]));
    }
    resolveDep(entityUid) {
        if (this.depQueueMap.delete(entityUid))
            return;
        else {
            if (this.depMap.has(entityUid)) {
                this.depResolveQueue.push(entityUid);
            }
        }
    }
    /**
     * @param {EntityComponentContainer} container
     */
    updateEntityComponentContainer(container) {
        const deactivateItems = container.deactivateEntityQueue.length > 0;
        if (deactivateItems) {
            for (let i = 0; i < container.deactivateEntityQueue.length; ++i) {
                container.activeEntitySet.delete(container.deactivateEntityQueue[i]);
            }
        }
        for (let i = 0; i < container.activateEntityQueue.length; ++i) {
            const entityUid = container.activateEntityQueue[i];
            if (container.activeEntitySet.has(entityUid))
                continue;
            else {
                container.activeEntitySet.add(entityUid);
                container.activeEntityArray.push(entityUid);
            }
        }
        if (deactivateItems) {
            for (let i = container.activeEntityArray.length - 1; i >= 0; --i) {
                const uid = container.activeEntityArray[i];
                if (container.activeEntitySet.delete(uid)) {
                    utils_1.fastArrayDelete(container.activeEntityArray, i);
                }
            }
            container.deactivateEntityQueue = [];
        }
    }
    updateDepContainers() {
        if (this.depQueueMap.size > 0) {
            for (const [depUid, effectedSet] of this.depQueueMap) {
                let set = this.depMap.get(depUid);
                if (!set) {
                    this.depMap.set(depUid, new Set());
                    set = this.depMap.get(depUid);
                }
                for (const effected of effectedSet)
                    set.add(effected);
            }
            this.depQueueMap.clear();
        }
        for (let i = this.depResolveQueue.length - 1; i >= 0; --i) {
            const depArray = this.depMap[this.depResolveQueue[i]];
            if (!depArray)
                continue;
            for (let j = depArray.length - 1; j >= 0; --j) {
                if (depArray.idled) {
                    this.activateRequiredComponents(depArray[i].effectedEntity);
                }
            }
            this.depMap.delete(this.depResolveQueue[i]);
        }
        this.depResolveQueue = [];
        //console.log("done");
        for (const [entity, depSet] of this.depMap.entries()) {
            for (let i = depSet.size - 1; i >= 0; --i) {
                const dep = depSet[i];
                if (!dep.idled && ++dep.idleTime > ENTITY_IDLE_AFTER_FRAMES) {
                    //console.log("IDLING");
                    dep.idled = true;
                    this.deactivateRequiredComponents(depSet[i].effectedEntity);
                }
            }
        }
    }
    update() {
        this.updateDepContainers();
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            this.updateEntityComponentContainer(this.entityComponentContainers[this.requiredComponentIds[i]]);
        }
        this.updateEntityComponentContainer(this.beltPaths.container);
    }
    /////////////// BeltPaths-Specific Logic /////////////////
    /**
     * @returns {Array<EntityUid>}
     */
    getActiveBeltPaths() {
        return this.beltPaths.container.activeEntityArray;
    }
    addBeltPath(beltPath) {
        if (!this.beltPaths.allBeltPaths.has(beltPath)) {
            this.beltPaths.allBeltPaths.set(beltPath.uid, beltPath);
            this.beltPaths.container.activateEntityQueue.push(beltPath.uid);
        }
    }
    removeBeltPath(beltPath) {
        if (!this.beltPaths.allBeltPaths.has(beltPath)) {
            this.beltPaths.allBeltPaths.delete(beltPath.uid);
            this.beltPaths.container.deactivateEntityQueue.push(beltPath.uid);
        }
    }
    giveItemAcceptorListener(targetAcceptor) {
        targetAcceptor.components.ItemAcceptor.reportOnItemAccepted(this, targetAcceptor.uid);
    }
    /**
     * Report and create dependencies
     * On items with a
     */
    reportBeltPathFull(beltPath, targetAcceptor) {
        //console.log("belt full");
        this.queueNewDep(beltPath, beltPath.uid);
        if (targetAcceptor) {
            this.queueNewDep(beltPath, targetAcceptor.uid);
            this.giveItemAcceptorListener(targetAcceptor);
        }
    }
    reportBeltPathEmpty(beltPath) {
        //console.log("belt empty");
        this.queueNewDep(beltPath, beltPath.uid);
    }
    reportEjectorFull(entityWithEjector, targetAcceptor) {
        //console.log("ejector full");
        this.queueNewDep(entityWithEjector, entityWithEjector.uid);
        this.queueNewDep(entityWithEjector, targetAcceptor.uid);
        this.giveItemAcceptorListener(targetAcceptor);
    }
    reportEjectorEmpty(entityWithEjector) {
        //console.log("ejector empty");
        this.queueNewDep(entityWithEjector, entityWithEjector.uid);
    }
    reportAcceptorFull(entityWithAcceptor) {
        //console.log("acceptor full");
        this.queueNewDep(entityWithAcceptor, entityWithAcceptor.uid);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportAcceptorEmpty(entityWithAcceptor) {
        //console.log("acceptor empty");
        this.queueNewDep(entityWithAcceptor, entityWithAcceptor.uid);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportBeltPathResolved(beltPathUid, targetAcceptorUid) {
        //console.log("belt resolved");
        if (targetAcceptorUid)
            this.resolveDep(targetAcceptorUid);
        this.resolveDep(beltPathUid);
    }
    reportItemAcceptorAcceptedItem(entityUid) {
        //console.log("acceptor resolved");
        this.resolveDep(entityUid);
    }
    reportItemEjectorEjectedItem(entityUid, targetUid) {
        //console.log("ejector resolved");
        this.resolveDep(entityUid);
        if (targetUid)
            this.resolveDep(targetUid);
    }
    internalCheckEntityAfterComponentRemoval(entity) {
        super.internalCheckEntityAfterComponentRemoval(entity);
        this.deactivateRequiredComponents(entity);
    }
    internalRegisterEntity(entity) {
        super.internalRegisterEntity(entity);
        this.activateRequiredComponents(entity);
    }
    internalPopEntityIfMatching(entity) {
        if (this.allEntitiesMap.has(entity.uid)) {
            this.deactivateRequiredComponents(entity);
        }
        super.internalPopEntityIfMatching(entity);
    }
    refreshCaches() {
        // Remove all entities which are queued for destroy
        for (let i = 0; i < this.allEntitiesKeys.length; ++i) {
            const entity = this.allEntitiesMap[this.allEntitiesKeys[i]];
            if (entity.queuedForDestroy || entity.destroyed) {
                this.deactivateRequiredComponents(entity);
                this.allEntitiesMap.delete(entity.uid);
                utils_1.fastArrayDelete(this.allEntitiesKeys, i);
            }
        }
    }
    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) { }
}
exports.SystemUpdateReporter = SystemUpdateReporter;
