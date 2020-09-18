import { Container } from "pixi.js";
import { fastArrayDelete, fastArrayDeleteValueIfContained } from "../../core/utils";
import { Component } from "../component";
import { BeltComponent } from "../components/belt";
import { ItemAcceptorComponent } from "../components/item_acceptor";
import { ItemEjectorComponent } from "../components/item_ejector";
import { ItemProcessorComponent } from "../components/item_processor";
import { MinerComponent } from "../components/miner";
import { StorageComponent } from "../components/storage";
import { UndergroundBeltComponent } from "../components/underground_belt";
import { Entity } from "../entity";
import { GameSystem } from "../game_system";
import { GameSystemWithFilter } from "../game_system_with_filter";

// TODO object docs
// TODO CHECK LOGIC WIRES ISSUES

/**
 * If an entity is idle for this many frames, deactivate all of its components
 * => frame based to scale by target performance, lower targeted simulation tick
 *      should probably take a bit slower to perform the idle process
 */
const ENTITY_IDLE_AFTER_FRAMES = 15;

/**
 * @typedef {number} EntityUid
 * @typedef {string} ComponentId
 */
type EntityUid = number;
type ComponentId = string;

/**
 * @typedef {Object} BeltPathFwd
 * @property {number} uid
 * @property {function} getItemAcceptorComponentId
 */

 interface BeltPathFwd {
    uid: EntityUid,
    isBeltPath: boolean,
    getItemAcceptorComponentId(): EntityUid
 }

/**
 * @typedef {Object} EntityComponentContainer
 * @property {Set<EntityUid>} activeEntitySet
 * @property {Array<EntityUid>} activeEntityArray
 * @property {Array<EntityUid>} activateEntityQueue
 * @property {Array<EntityUid>} deactivateEntityQueue
 */

 interface EntityComponentContainer {
    activeEntitySet: Set<EntityUid>,
    activeEntityArray: Array<EntityUid>,
    activateEntityQueue: Array<EntityUid>,
    deactivateEntityQueue: Array<EntityUid>
}

/**
 * @typedef {Object} BeltPathContainer
 * @property {EntityComponentContainer} container
 * @property {Map<EntityUid, BeltPathFwd>} allBeltPaths
 */
interface BeltPathContainer {
    container: EntityComponentContainer,
    allBeltPaths: Map<EntityUid, BeltPathFwd>
}

/**
 * @typedef {Object} Dependency
 * @property {EntityUid} dependent
 * @property {number} idleTime
 * @property {boolean} idled
 */
interface Dependency{
    dependentEntity: Entity|BeltPathFwd,
    idleTime: number,
    idled: boolean
}

/**
 * Holds onto any updates that
 */
export class SystemUpdateReporter extends GameSystemWithFilter {
    constructor(root) {
        super(root, [
            ItemAcceptorComponent, 
            ItemEjectorComponent, 
            ItemProcessorComponent,
            StorageComponent,
            UndergroundBeltComponent,
            // (and also BeltPaths added from Belt system)
        ]);

        for(let i = 0; i < this.requiredComponentIds.length; ++i) {

            const container: EntityComponentContainer = {
                activeEntitySet: new Set(),
                activeEntityArray: [],
                activateEntityQueue: [],
                deactivateEntityQueue: []
            };
            this.entityComponentContainers[this.requiredComponentIds[i]] = container;
        }

    }







    //  /**
    //   * @type {Map<ComponentId, EntityUid>}
    //   */
    entityComponentContainers: Map<ComponentId, EntityComponentContainer> = new Map();


    addToRelevantQueues(entity: Entity|BeltPathFwd, listKey: string) {
        if(entity.isBeltPath) {
            (this.beltPaths.container[listKey] as Array<EntityUid>).push(entity.uid);
        }
        entity = entity as Entity;
        for(let i = 0; i < this.requiredComponentIds.length; ++i){

            if(entity.components[this.requiredComponentIds[i]]) {
                const container = this.entityComponentContainers[this.requiredComponentIds[i]];
                (container[listKey] as Array<EntityUid>).push(entity.uid);
            }

        }
    }


    deactivateRequiredComponents(entity: Entity|BeltPathFwd) {
        this.addToRelevantQueues(entity, 'deactivateEntityQueue');
    }

    activateRequiredComponents(entity: Entity|BeltPathFwd) {
        this.addToRelevantQueues(entity, 'activateEntityQueue');
    }

    /**
     * @type {Array<Entity|BeltPathFwd>}
     */
    //reactivateRequiredComponents: Array<Entity|BeltPathFwd> = [];



    /**
     * @type {Map<EntityUid, Array<Dependency>>}
     */
    dependencyMap: Map<EntityUid, Array<Dependency>> = new Map();

    /**
     * Dependency => Dependents
     * @type {Map<EntityUid, Array<Dependency>>}
     */
    dependencyQueue: Map<EntityUid, Array<Dependency>> = new Map();

    /**
     * @type {Array<EntityUid>}
     * 
     */
    dependencyResolveQueue: Array<EntityUid> = [];


    /**
     * @type {BeltPathContainer}
     */
    beltPaths: BeltPathContainer = {
        container: {
            activeEntitySet: new Set(),
            activeEntityArray: [],
            activateEntityQueue: [],
            deactivateEntityQueue: [],
        },
        allBeltPaths: new Map(),
    };



    ////////////////// Entities and Updates ///////////////

    /**
     * @param {string} componentId
     * @returns {Array<EntityUid>}
     */
    getActiveEntitiesByComponent(componentId: ComponentId): Array<EntityUid> {
        return this.entityComponentContainers[componentId].activeEntityArray;
    }


    /**
     * @param {EntityComponentContainer} container
     */
    updateEntityComponentContainer(container: EntityComponentContainer) {

        let deactivateItems = container.deactivateEntityQueue.length > 0;
            
        if(deactivateItems) {
            for(let i = 0; i < container.deactivateEntityQueue.length; ++i) {
                container.activeEntitySet.delete(container.deactivateEntityQueue[i]);
            }
        }
        
        for(let i = 0; i < container.activateEntityQueue.length; ++i) {
            const entityUid: EntityUid = container.activateEntityQueue[i];
            if(container.activeEntitySet.has(entityUid)) continue;
            else {
                container.activeEntitySet.add(entityUid);
                container.activeEntityArray.push(entityUid);
            }
        }

        if(deactivateItems) {
            for(let i = container.activeEntityArray.length - 1; i >= 0; --i) {
                let uid = container.activeEntityArray[i];
                if(container.activeEntitySet.delete(uid)) {
                    fastArrayDelete(container.activeEntityArray, i);
                }
            }
            container.deactivateEntityQueue = [];
        }

        
    }


    updateDependencyContainers() {

        if(this.dependencyQueue.size > 0) {
            for(let [dependencyEntityUid, dependencyArray] of this.dependencyQueue.entries()){
                if(this.dependencyMap.has(dependencyEntityUid)) {
                    this.dependencyMap[dependencyEntityUid].push(...dependencyArray);
                }
                else this.dependencyMap[dependencyEntityUid] = dependencyArray;
            }
        }

        for(let i = this.dependencyResolveQueue.length - 1; i >= 0; --i) {
            
            const dependencyArray = this.dependencyMap[this.dependencyResolveQueue[i]];

            if(!dependencyArray) continue;
            for(let j = dependencyArray.length - 1; j >= 0; --j) {
                if(dependencyArray.idled) {
                    this.activateRequiredComponents(dependencyArray[i].dependentEntity);
                }
            }

            this.dependencyMap.delete(this.dependencyResolveQueue[i]);

        }

        for(let [entity, dependencyArray] of this.dependencyMap.entries())  {
            for(let i = dependencyArray.length - 1; i >= 0; --i) {
                const dependency = dependencyArray[i];
                if(++dependency.idleTime > ENTITY_IDLE_AFTER_FRAMES && !dependency.idled) {
                     this.deactivateRequiredComponents(dependencyArray[i].dependentEntity);
                }

            }
        }

    }


    update() {
        this.updateDependencyContainers();
        for(let i = 0; i < this.requiredComponentIds.length; ++i) {
            this.updateEntityComponentContainer(
                this.entityComponentContainers[this.requiredComponentIds[i]]);
        }
        this.updateEntityComponentContainer(this.beltPaths.container, this.beltPaths.allBeltPaths);
    }




    /////////////// BeltPaths-Specific Logic /////////////////


    /**
     * @returns {Array<EntityUid>}
     */
    getActiveBeltPaths() {
        return this.beltPaths.container.activeEntityArray;
    }


    addBeltPath(beltPath) {
        this.beltPaths.allBeltPaths.set(beltPath.uid, beltPath);
        this.beltPaths.container.activateEntityQueue.add(beltPath.uid);
    }

    removeBeltPath(beltPath) {
        this.beltPaths.allBeltPaths.delete(beltPath.uid);
        this.beltPaths.container.deactivateEntityQueue.add(beltPath.uid);
    }

    resolveBeltPath(beltPath) {        
        this.beltPaths.container.activateEntityQueue.add(beltPath.uid);

        let container = this.entityComponentContainers[ItemAcceptorComponent.getId()];
        let acceptor = beltPath.acceptorTarget.entity;
        if(!container.activeEntityMap.has(acceptor.uid)) {
            container.activateEntityQueue.push();

        }
    }






    /**
     * @param {EntityUid} dependentEntityUid
     * @param {EntityUid} itemAcceptorEntityUid
     * @param {ItemAcceptorComponent} itemAcceptorComponent
     */
    addItemAcceptorDependency(dependentEntityUid, itemAcceptorEntityUid, itemAcceptorComponent) {

        


        let dependencyArray



        if(this.dependencyQueue.has(dependentEntityUid)) {
            const dependency: Dependency = {

            }
            this.dependencyQueue[dependentEntityUid].push()
        }
    }

    addItemEjectorDependency(dependentEntityUid, itemAcceptorEntityUid) {

    }





    reportBeltPathFull(beltPath) {
        this.beltPaths.container.deactivateEntityQueue.add(beltPath.uid);
        this.addItemAcceptorDependency(beltPath.getItemAcceptorComponentId);
    }

    reportBeltPathEmpty(beltPath) {
        this.beltPaths.container.deactivateEntityQueue.add(beltPath.uid);
    }




    reportEjectorFull(entityWithEjector: EntityUid, targetAcceptor: EntityUid){
        /**
         * if we have an acceptor which is also blocked, add a 
         * dependency to the ejector and target acceptor
         */
        this.addItemAcceptorDependency(entityWithEjector, targetAcceptor);
    }

    reportEjectorEmpty(entityWithEjector) {
        /**
         * IF we have an ejector, and the acceptor is empty we are idle, dependent on acceptor
         */
    }

    






    reportAcceptorEmpty(entityWithAcceptor) {
        if(entityWithAcceptor.empty)
    }


    /**
     * @param {EntityUid} entityWithAcceptor
     */
    reportAcceptorFull(entityWithAcceptor) {

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

    resolveDependencies(dependencyUid: EntityUid, componentId: ComponentId) {
        if(this.)
    }

    reportItemAcceptorUnblocked(entityUid) {
        this.resolveDependencies(entityUid, ItemAcceptorComponent.getId());
    }


    // tooooooo do
    //  we ~could~ ignore an active state on entity, but this may not work well
    //  we ~should~ have a case to try to assign activity or inactivity based on the condition
    //      like, for instance, most items are inactive if it cannot accept or eject an item
    //          but what does that mean in terms of components and what can be updated
    //          we'll have to crawl through these systems again

    /**
     * @param {string} componentId
     * 
     */
    getActiveEntityComponents(componentId) {
        return this.activeEntityComponentUids[componentId];
    }

    setEntityActive(entity) {

    }

    reportEntityActive(entity) {
        assert(!entity.active, "entity was reported active but it is not!");
        let it;
        if(it = this.idleEntityDependents.delete(entity.uid)) {
            this.allEntitiesMap[it].active = true;
        }
    }

    reportEntityInactive(entity) {

    }


    /**
     *
     * @param {Entity} entity
     */
    internalRegisterEntity(entity) {

        this.allEntitiesMap[entity.uid] = entity;

        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (entity.components[this.requiredComponentIds[i]]) {
                if(entity.active)
            }
        }

        this.allEntitiesKeys.push(entity.uid);

        if (this.root.gameInitialized && !this.root.bulkOperationRunning) {
            // Sort entities by uid so behaviour is predictable
            this.allEntitiesKeys.sort((a, b) => a - b);
        }
    }



    internalCheckEntityAfterComponentRemoval
    internalReconsiderEntityToAdd
    internalRegisterEntity


    

    /*
     * indicates an enitity cannot perform update logic due to (usually)
     *  an entity it is depent is blocked and cannot pass an item
     * Will not report idle if entities are codepenent
     * Codependencies are resolved if an item that was inactive or idled is now active or unidled
     */
    tryReportIdleDromDependent(entityIndex, system, dependentIndex, dependentSysem) {}


    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) {}
}
