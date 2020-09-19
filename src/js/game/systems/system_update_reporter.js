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
const ENTITY_IDLE_AFTER_FRAMES = 15;
///////////////////////////////////////////////////////////////////////////
//                                                                       //
// THIS SYSTEM IS BASED ON THREE VERY IMPORTANT THINGS SO I MUST SCREAM  //
//                                                                       //
//  1. IDLE BELTPATHS CAN BE RESOLVED BY THE BELTPATH ITEM ACCEPTOR AND  //
//      COMPONENT BASED CHANGES                                          //
//  2. IDLE ENTITIES WITH ITEM ACCEPTORS ARE RESOLVED BY ITEM ACCEPTOR   //
//      BASED CHANGES                                                    //
//  3. IDLE ENTITIES WITH ITEM EJECTORS ARE RESOLVED BY A DEPENDENT      //
//          ENTITY'S ITEM ACCEPTOR CHANGES                               //
//                                                                       //
// IN OTHER WORDS, THIS IS ALL DEPENDENT ON AUTONOMOUS CHANGES TO ITEM   //
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
        /**
         * @type {Array<Entity|BeltPathFwd>}
         */
        //reactivateRequiredComponents: Array<Entity|BeltPathFwd> = [];
        /**
         * @type {Map<EntityUid, Array<Dependency>>}
         */
        this.dependencyMap = new Map();
        /**
         * Dependency => Dependents
         * @type {Map<EntityUid, Array<Dependency>>}
         */
        this.dependencyQueue = new Map();
        /**
         * @type {Array<EntityUid>}
         *
         */
        this.dependencyResolveQueue = [];
        /**
         * @type {BeltPathContainer}
         */
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
        if (addEntity.isBeltPath) {
            this.beltPaths.container[listKey].push(addEntity.uid);
        }
        const entity = addEntity;
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (entity.components[this.requiredComponentIds[i]]) {
                const container = this.entityComponentContainers[this.requiredComponentIds[i]];
                container[listKey].push(entity.uid);
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
    queueNewDependency(dependentEntity, entityUid) {
        const dependency = {
            dependentEntity: dependentEntity,
            idleTime: 0,
            idled: false,
        };
        if (this.dependencyQueue.has(entityUid)) {
            this.dependencyQueue[entityUid].push(dependency);
        }
        else {
            this.dependencyQueue[entityUid] = [dependency];
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
    updateDependencyContainers() {
        if (this.dependencyQueue.size > 0) {
            for (const [dependencyEntityUid, dependencyArray] of this.dependencyQueue.entries()) {
                if (this.dependencyMap.has(dependencyEntityUid)) {
                    this.dependencyMap[dependencyEntityUid].push(...dependencyArray);
                }
                else
                    this.dependencyMap[dependencyEntityUid] = dependencyArray;
            }
        }
        for (let i = this.dependencyResolveQueue.length - 1; i >= 0; --i) {
            const dependencyArray = this.dependencyMap[this.dependencyResolveQueue[i]];
            if (!dependencyArray)
                continue;
            for (let j = dependencyArray.length - 1; j >= 0; --j) {
                if (dependencyArray.idled) {
                    this.activateRequiredComponents(dependencyArray[i].dependentEntity);
                }
            }
            this.dependencyMap.delete(this.dependencyResolveQueue[i]);
        }
        for (const [entity, dependencyArray] of this.dependencyMap.entries()) {
            for (let i = dependencyArray.length - 1; i >= 0; --i) {
                const dependency = dependencyArray[i];
                if (++dependency.idleTime > ENTITY_IDLE_AFTER_FRAMES && !dependency.idled) {
                    this.deactivateRequiredComponents(dependencyArray[i].dependentEntity);
                }
            }
        }
    }
    update() {
        this.updateDependencyContainers();
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
        this.queueNewDependency(beltPath, beltPath.uid);
        if (targetAcceptor) {
            this.queueNewDependency(beltPath, targetAcceptor.uid);
            this.giveItemAcceptorListener(targetAcceptor);
        }
    }
    reportBeltPathEmpty(beltPath) {
        this.queueNewDependency(beltPath, beltPath.uid);
    }
    reportEjectorFull(entityWithEjector, targetAcceptor) {
        this.queueNewDependency(entityWithEjector, entityWithEjector.uid);
        this.queueNewDependency(entityWithEjector, targetAcceptor.uid);
        this.giveItemAcceptorListener(targetAcceptor);
    }
    reportEjectorEmpty(entityWithEjector) {
        this.queueNewDependency(entityWithEjector, entityWithEjector.uid);
    }
    reportAcceptorEmpty(entityWithAcceptor) {
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor.uid);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportAcceptorFull(entityWithAcceptor) {
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor.uid);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportBeltPathResolved(beltPathUid, targetAcceptorUid) {
        if (targetAcceptorUid)
            this.dependencyResolveQueue.push(targetAcceptorUid);
        this.dependencyResolveQueue.push(beltPathUid);
    }
    reportItemAcceptorAcceptedItem(entityUid) {
        this.dependencyResolveQueue.push(entityUid);
    }
    reportItemEjectorEjectedItem(entityUid, targetUid) {
        this.dependencyResolveQueue.push(entityUid);
        if (targetUid)
            this.dependencyResolveQueue.push(targetUid);
    }
    /////////////////// Dependencies ////////////////
    // resolveDependencies(entityResolvedUid, component) {
    //     // check if
    //     let dependency = this.dependencyQueueReverseReference[entityResolvedUid];
    //     if(this.dependencyQueueReverse.delete(entityResolvedUid)) {
    //         this.dependencyQueue[dependency].dependents.delete(entityResolvedUid);
    //     }
    //     if(this.dependencyMap[entityResolvedUid]) {
    //         this.dependencyResolveQueue.push(this.dependencyMap[entityResolvedUid]);
    //     }
    // }
    // resolveDependencies(dependencyUid: EntityUid, componentId: ComponentId) {
    //     if(this.dependencyQueue.has(dependencyUid)) {
    //         let resolveArray: Array<Dependency> = this.dependencyQueue[dependencyUid];
    //         this.dependencyQueue.delete(dependencyUid);
    //         this.dependencyResolveQueue.push(...resolveArray);
    //     }
    //     let dependencyQueue: Array<Dependency> = this.dependencyQueue[dependencyUid];
    //     let dependencies: Array<Dependency> = this.dependencyMap[dependencyUid];
    //     if(this.dependencyQueue.delete())
    // }
    internalCheckEntityAfterComponentRemoval(entity) {
        super.internalCheckEntityAfterComponentRemoval(entity);
        this.deactivateRequiredComponents(entity);
    }
    internalRegisterEntity(entity) {
        super.internalRegisterEntity(entity);
        this.activateRequiredComponents(entity);
    }
    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) { }
}
exports.SystemUpdateReporter = SystemUpdateReporter;
