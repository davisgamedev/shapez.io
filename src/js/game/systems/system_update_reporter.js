import { Container } from "pixi.js";
import { forEachChild } from "typescript";
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
import { SystemUpdateResolver } from "./system_update_resolver";

// TODO object docs


const BELTPATH_TRACE_THRESHOLD = 30;


/**
 * @typedef {number} EntityUid
 * @typedef {string} ComponentId
 * @typedef {number} InactiveFrames
 */

/**
 * @typedef {Object} BeltPathFwd
 * @property {number} uid
 * @property {function} getItemAcceptorComponentId
 */

/**
 * @typedef {Object} EntityComponentContainer
 * @property {Map<EntityUid, BeltPathFwd>} activeEntityMap
 * @property {Array<EntityUid>} activeEntityArray
 * @property {Set<EntityUid>} activateEntityQueue
 * @property {Set<EntityUid>} deactivateEntityQueue
 */

/**
 * @typedef {Object} BeltPathContainer
 * @property {EntityComponentContainer} container
 * @property {Map<EntityUid, InactiveFrames>} inactiveFrames
 * @property {Map<EntityUid, BeltPathFwd>} allBeltPaths
 */


/**
 * 
 * @typedef {Map<EntityUid, Array<}
 */

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
            // BeltPaths added from Belt system
        ]);

        for(let i = 0; i < this.requiredComponentIds.length; ++i) {
            this.entityComponentContainers[this.requiredComponentIds[i]] = {
                activeEntityMap: new Map(),
                activeEntityArray: [],
                activateEntityQueue: [],
                deactivateEntityQueue: new Set(),
            }
        }

    }


     /**
      * @type {Map<ComponentId, EntityUid>}
      */
    entityComponentContainers = new Map();

    /**
     * @type {Set<Entity|BeltPathFwd>}
     */
    deactivateAllEntityComponentsQueue = new Set();

    /**
     * @type {Set<Entity|BeltPathFwd>}
     */
    activateAllEntityComponentsQueue = new Set();


    /**
     * @type {BeltPathContainer}
     */
    beltPaths = {
        container: {
            activeEntityMap: new Map(),
            activeEntityArray: [],
            activateEntityQueue: new Set(),
            deactivateEntityQueue: new Set(),
        },
        inactiveFrames: new Map(),
        allBeltPaths: new Map(),
    };



    ////////////////// Entities and Updates ///////////////

    /**
     * @param {string} componentId
     * @returns {Array<EntityUid>}
     */
    getActiveEntitiesByComponent(componentId) {
        return this.entityComponentContainers[componentId].activeEntityArray;
    }


    /**
     * @param {EntityComponentContainer} container
     * @param {Map<EntityUid, Entity|BeltPathFwd>} allItemsMap
     */
    updateContainer(container, allItemsMap = this.allEntitiesMap) {

        let rebuildArray = container.deactivateEntityQueue.size > 0;
            
        if(rebuildArray) {
            for(let i = 0; i < container.deactivateEntityQueue.size; ++i) {
                container.activeEntityMap.delete(container.deactivateEntityQueue.entries()[i]);
            }
        }
        
        for(let i = 0; i < container.activateEntityQueue.size; ++i) {
            container.activeEntityMap[container.activateEntityQueue[i]] =
                allItemsMap[container.activateEntityQueue[i]];
            container.activeEntityArray.push(container.activateEntityQueue[i]);
        }

        if(rebuildArray) {
            for(let i = container.activeEntityArray.length - 1; i >= 0; --i) {
                let uid = container.activeEntityArray[i];
                if(!container.activeEntityMap.has(uid)) {
                    fastArrayDelete(container.activeEntityArray, i);
                }
            }
            container.deactivateEntityQueue.clear();
        }

        if(container.activeEntityArray.length > 0) container.activeEntityArray = [];
        
    }


    update() {

        if(this.deactivateAllEntityComponentsQueue.size > 0) {
            this.deactivateAllEntityComponentsQueue.forEach(entityId => {})
        }

        for(let i = 0; i < this.requiredComponentIds.length; ++i) {
            this.updateContainer(
                this.entityComponentContainers[this.requiredComponentIds[i]]);
        }
        this.updateContainer(this.beltPaths.container, this.beltPaths.allBeltPaths);
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

    reportFullBeltPath(beltPath) {
        this.beltPaths.container.deactivateEntityQueue.add(beltPath.uid);
        this.addItemAcceptorDependency(beltPath.getItemAcceptorComponentId);
    }

    reportEmptyBeltPath(beltPath) {
        this.beltPaths.container.deactivateEntityQueue.add(beltPath.uid);
    }





    /**
     * @param {EntityUid} entityWithEjector
     */
    reportEjectorFull(entityWithEjector){
        /**
         * IF we have an acceptor which is also blocked, then the depency is the ejector
         */
        const entity = this.allEntitiesKeys[entityWithEjector];
        if(entity.)
    }

    /**
     * @param {EntityUid} entityWithAcceptor
     */
    reportAcceptorFull(entityWithAcceptor) {

    }




    /////////////////// Dependencies ////////////////

    resolveDependencies(entityUid) {
        
    }


    reportInactiveEntity(){}
    reportActiveEntity(){}


    // remove all but acceptor components
    reportEntityIdleDependent(entity, dependent) {
        if(this.inactiveEntityComponentUids)
    }


    /**
     * map<componentId, array<entity.uid>>
     * @type {Map<string, Array<number>>}
     */
    inactiveEntityComponentUids;


    /**
     * entity idle because of depentity
     */
    idleEntities = new Map();

    /**
     * (reverse lookup)
     * dependity causing entity idle
     * @type {Map<number, number>}
     */
    idleEntityDependents= new Map();


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


    



    // if an item ejector was successful
    reportActive(entityIndex, system) {}

    // if there are no items in system
    reportInactive(entityIndex, system) {}

    /*
     * indicates an enitity cannot perform update logic due to (usually)
     *  an entity it is depent is blocked and cannot pass an item
     * Will not report idle if entities are codepenent
     * Codependencies are resolved if an item that was inactive or idled is now active or unidled
     */
    tryReportIdleDromDependent(entityIndex, system, dependentIndex, dependentSysem) {}

    addIdleDependent() {}

    addInactive() {}

    getActiveEntities(system, entities) {}

    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) {}
}
