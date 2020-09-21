"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemUpdateReporter = void 0;
const utils_1 = require("../../core/utils");
const item_acceptor_1 = require("../components/item_acceptor");
const item_ejector_1 = require("../components/item_ejector");
const miner_1 = require("../components/miner");
const storage_1 = require("../components/storage");
const game_system_with_filter_1 = require("../game_system_with_filter");
// TODO object docs
// TODO CHECK LOGIC WIRES ISSUES
/**
 * If an entity is idle for this many frames, deactivate all of its components
 * => frame based to scale by target performance, lower targeted simulation tick
 *      should probably take a bit slower to perform the idle process
 */
const ENTITY_IDLE_AFTER_FRAMES = 60;
// /**
//  * @typedef {Object} Dep
//  * @property {Entity} effected
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
            storage_1.StorageComponent,
            miner_1.MinerComponent,
        ]);
        //  /**
        //   * @type {Map<ComponentId, Entity>}
        //   */
        this.entityComponentContainers = new Map();
        // entDependentOn: [effectedEntities]
        // contains all entities (idled or not) that are effected on another entity's update
        this.entDependentOnMap = new Map();
        // queue to determine who is added to map (some entities are removed during updates)
        this.entDependentOnQueueMap = new Map();
        // all entDependentOnedencies queued to be resolved
        this.entResolveQueue = new Set();
        // all entities that have been idled (removed from updates);
        this.entIdleSet = new Set();
        // all entities that are awaiting idled, Entity: Frames
        this.entIdleWaitSet = new Set();
        this.entIdleWaitFrames = 0;
        this.beltPaths = {
            container: {
                activeEntitySet: new Set(),
                reactivateEntityQueue: new Set(),
                deactivateEntityQueue: new Set(),
            },
            allBeltPaths: new Set(),
        };
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            const container = {
                activeEntitySet: new Set(),
                reactivateEntityQueue: new Set(),
                deactivateEntityQueue: new Set(),
            };
            this.entityComponentContainers.set(this.requiredComponentIds[i], container);
        }
    }
    acceptSystemUpdateResolver(resolver) {
        super.acceptSystemUpdateResolver(resolver);
        resolver.provideReporter(this);
    }
    addToRelevantQueues(entity, setKey) {
        if (!entity.components) {
            this.beltPaths.container[setKey].add(entity);
            return;
        }
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (entity.components[this.requiredComponentIds[i]] != null) {
                const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
                container[setKey].add(entity);
            }
        }
    }
    checkEntityExists(entity) {
        return this.allEntitiesSet.has(entity) || this.beltPaths.allBeltPaths.has(entity);
    }
    // TODO
    //we need to delete it from any and all component records
    //we will then need to release all of its dependencies
    deleteComponents(entity) {
        if (this.checkEntityExists(entity)) {
            this.entResolveQueue.add(entity);
            this.entIdleWaitSet.delete(entity);
            this.entIdleSet.delete(entity);
            if (!entity.components) {
                this.beltPaths.allBeltPaths.delete(entity);
            }
            else {
                this.allEntitiesSet.delete(entity);
                for (let i = 0; i < this.requiredComponentIds.length; ++i) {
                    if (entity.components[this.requiredComponentIds[i]] != null) {
                        this.entityComponentContainers
                            .get(this.requiredComponentIds[i])
                            .activeEntitySet.delete(entity);
                    }
                }
            }
            this.deactivateRequiredComponents(entity);
        }
    }
    createComponents(entity) {
        if (this.entDependentOnMap.has(entity) || this.entDependentOnQueueMap.has(entity)) {
            this.resolveDependency(entity);
        }
        this.entIdleWaitSet.delete(entity);
        this.entIdleSet.delete(entity);
        if (!entity.components) {
            this.beltPaths.allBeltPaths.add(entity);
            this.beltPaths.container.activeEntitySet.add(entity);
        }
        else {
            this.allEntitiesSet.add(entity);
            for (let i = 0; i < this.requiredComponentIds.length; ++i) {
                if (entity.components[this.requiredComponentIds[i]] != null) {
                    this.entityComponentContainers
                        .get(this.requiredComponentIds[i])
                        .activeEntitySet.add(entity);
                }
            }
        }
        this.reactivateRequiredComponents(entity);
    }
    deactivateRequiredComponents(entity) {
        this.addToRelevantQueues(entity, "deactivateEntityQueue");
    }
    reactivateRequiredComponents(entity) {
        this.addToRelevantQueues(entity, "reactivateEntityQueue");
    }
    ////////////////// Entities and Updates ///////////////
    /**
     * @param {string} componentId
     * @returns {Array<Entity>}
     */
    getActiveEntitiesByComponent(componentId) {
        return [
            ...this.entityComponentContainers.get(componentId).activeEntitySet,
        ];
    }
    queueNewDependency(entDependentOn, dependentEnt) {
        if (this.entDependentOnMap.has(entDependentOn) &&
            this.entDependentOnMap.get(entDependentOn).has(dependentEnt)) {
            return;
        }
        const set = this.entDependentOnQueueMap.get(entDependentOn);
        if (set) {
            set.add(dependentEnt);
        }
        else {
            this.entDependentOnQueueMap.set(entDependentOn, new Set([dependentEnt]));
        }
    }
    // TODO: this could be faster
    resolveDependency(entDependentOn) {
        this.entDependentOnQueueMap.delete(entDependentOn);
        const set = this.entDependentOnMap.get(entDependentOn);
        if (set) {
            utils_1.fastSetAppend(this.entResolveQueue, set);
        }
        this.reactivateRequiredComponents(entDependentOn);
    }
    /**
     * @param {EntityComponentContainer} container
     */
    updateEntityComponentContainer(container) {
        /**
         * for anything being reactivated, try deleting it from the deactivate queue
         *  activation supercedes deactivation
         * then remove anyting left in the deactivate queue
         */
        for (let arr = [...container.reactivateEntityQueue.values()], i = arr.length - 1, entity; (entity = arr[i]) && i >= 0; --i) {
            container.deactivateEntityQueue.delete(entity);
            if (this.checkEntityExists(entity)) {
                if (!container.activeEntitySet.has(entity)) {
                    container.activeEntitySet.add(entity);
                    this.entIdleSet.delete(entity);
                    this.entIdleWaitSet.delete(entity);
                    this.entResolveQueue.add(entity);
                }
            }
        }
        // prevents activeEntitySet from passing in a deactivated component
        for (let arr = [...container.deactivateEntityQueue.values()], i = arr.length - 1, entity; (entity = arr[i]) && i >= 0; --i) {
            container.activeEntitySet.delete(entity);
        }
        container.reactivateEntityQueue.clear();
        container.deactivateEntityQueue.clear();
    }
    updateDepContainers() {
        if (this.entDependentOnQueueMap.size > 0) {
            utils_1.logInterval("dependencyQueue: ", 60, this.entDependentOnQueueMap.size);
            // append dependencies to dependency maps
            for (let keys = [...this.entDependentOnQueueMap.keys()], vals = [...this.entDependentOnQueueMap.values()], i = keys.length - 1, entDependentOn = keys[i], dependentEntSet = vals[i]; i >= 0; --i, entDependentOn = keys[i], dependentEntSet = vals[i]) {
                const set = this.entDependentOnMap.get(entDependentOn) || new Set();
                this.entDependentOnMap.set(entDependentOn, utils_1.fastSetAppend(set, dependentEntSet));
                utils_1.fastSetAppend(this.entIdleWaitSet, dependentEntSet);
            }
        }
        if (this.entResolveQueue.size > 0) {
            // collect all of the entities being resolved
            const resolveEntities = new Set();
            utils_1.logInterval("entResolveQueue: ", 60, this.entResolveQueue.size);
            for (let arr = [...this.entResolveQueue.values()], i = arr.length - 1, entDependentOn; (entDependentOn = arr[i]) && i >= 0; --i) {
                utils_1.fastSetAppend(resolveEntities, this.entDependentOnMap.get(entDependentOn) || new Set());
                this.entDependentOnMap.delete(entDependentOn);
            }
            // reactivate all of their components
            for (let arr = [...resolveEntities.values()], i = arr.length - 1, entity; (entity = arr[i]) && i >= 0; --i) {
                this.entIdleWaitSet.delete(entity);
                this.entIdleSet.delete(entity);
                this.reactivateRequiredComponents(entity);
            }
        }
        // if we have waited long enough we can start to idle components
        // THIS ISN't ALWAYS WORKING
        if (++this.entIdleWaitFrames > ENTITY_IDLE_AFTER_FRAMES) {
            console.log("Trying to idle....");
            if (this.entIdleWaitSet.size > 0) {
                console.log("Idling " + this.entIdleWaitSet.size + " entities.");
                for (let arr = [...this.entIdleWaitSet.values()], i = arr.length - 1, entity; (entity = arr[i]) && i >= 0; --i) {
                    if (!this.entIdleSet.has(entity)) {
                        this.deactivateRequiredComponents(entity);
                        this.entIdleSet.add(entity);
                    }
                }
            }
            this.entIdleWaitSet.clear();
            this.entIdleWaitFrames = 0;
        }
        this.entDependentOnQueueMap.clear();
        this.entResolveQueue.clear();
    }
    update() {
        this.updateDepContainers();
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
            this.updateEntityComponentContainer(container);
        }
        this.updateEntityComponentContainer(this.beltPaths.container);
    }
    /////////////// BeltPaths-Specific Logic /////////////////
    getActiveBeltPaths() {
        return [...this.beltPaths.container.activeEntitySet];
    }
    addBeltPath(beltPath) {
        this.createComponents(beltPath);
    }
    removeBeltPath(beltPath) {
        this.deleteComponents(beltPath);
    }
    giveItemAcceptorListener(entityWithAcceptor) {
        entityWithAcceptor.components.ItemAcceptor.reportOnItemAccepted(this, entityWithAcceptor);
    }
    giveItemEjectorListener(entityWithEjector) {
        //entityWithEjector.components.ItemEjector.reportOnItemEjected(this, entityWithEjector);
    }
    /**
     * Report and create entDependentOnendencies
     * On items with a
     */
    reportBeltPathFull(beltPath, targetAcceptor) {
        //console.log("belt full");
        this.queueNewDependency(beltPath, beltPath);
        if (targetAcceptor) {
            this.queueNewDependency(targetAcceptor, beltPath);
            this.giveItemAcceptorListener(targetAcceptor);
        }
    }
    reportBeltPathEmpty(beltPath) {
        this.queueNewDependency(beltPath, beltPath);
    }
    reportEjectorFull(entityWithEjector, targetAcceptor) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);
        this.queueNewDependency(targetAcceptor, entityWithEjector);
        this.giveItemAcceptorListener(targetAcceptor);
        this.giveItemEjectorListener(entityWithEjector);
    }
    reportEjectorEmpty(entityWithEjector) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);
        this.giveItemEjectorListener(entityWithEjector);
    }
    reportAcceptorFull(entityWithAcceptor) {
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportAcceptorEmpty(entityWithAcceptor) {
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportBeltPathResolved(beltPath, target) {
        if (target)
            this.resolveDependency(target);
        this.resolveDependency(beltPath);
    }
    reportItemAcceptorAcceptedItem(entity) {
        this.resolveDependency(entity);
    }
    reportItemEjectorEjectedItem(entity, target) {
        this.resolveDependency(entity);
        if (target)
            this.resolveDependency(target);
    }
    internalCheckEntityAfterComponentRemoval(entity) {
        super.internalCheckEntityAfterComponentRemoval(entity);
        this.deleteComponents(entity);
    }
    internalRegisterEntity(entity) {
        super.internalRegisterEntity(entity);
        this.createComponents(entity);
    }
    internalPopEntityIfMatching(entity) {
        if (this.allEntitiesSet.delete(entity)) {
            this.deleteComponents(entity);
        }
        super.internalPopEntityIfMatching(entity);
    }
    refreshCaches() {
        // Remove all entities which are queued for destroy
        for (let set = [...this.allEntitiesSet], i = set.length - 1, entity = set[i]; i >= 0; --i) {
            if (entity.queuedForDestroy || entity.destroyed) {
                this.deactivateRequiredComponents(entity);
                this.deleteComponents(entity);
            }
        }
        super.refreshCaches();
    }
    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) { }
}
exports.SystemUpdateReporter = SystemUpdateReporter;
