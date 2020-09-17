import { fastArrayDeleteValueIfContained } from "../../core/utils";
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
            this.activeEntityComponentUids[this.requiredComponentIds[i]] = [];
        }

    }

    /**
     * map<componentId, array<entity.uid>>
     * @type {Map<string, Array<number>>}
     */
    activeEntitiesByComponents;


    inactiveEntities;

    idleEntities;


    emptyBelts = [];


    beltPaths = {
        active: new Map(),
        inactive: new Map(),
        activeArray: [],
        dirty: true,
    }

    inactiveBeltPaths;
    activeBeltPaths;

    getActiveBeltPaths() {
        
    }

    addBeltPath(beltPath) {
        this.beltPaths.active[beltPath.uid] = beltPath;
        this.beltPaths.dirty = true;
    }

    removeBeltPath(beltPath) {
        this.beltPaths.active.delete(beltPath.uid);
        this.beltPaths.inactive.delete(beltPath.uid);
        this.beltPaths.dirty = true;
    }

    resolveBeltPath(beltPath) {
        this.beltPaths.inactive.delete(beltPath.uid);
        this.beltPaths.active[beltPath.uid] = beltPath;
        this.beltPaths.dirty = true;
    }

    reportFullBeltPath(beltPath) {
        this.beltPaths.inactive.delete(beltPath.uid);
        this.beltPaths.active[beltPath.uid] = beltPath;
        this.beltPaths.dirty = true;
        // TODO remove belt entities
    }

    reportEmptyBeltPath(beltPath) {
        this.beltPaths.inactive.delete(beltPath.uid);
        this.beltPaths.active[beltPath.uid] = beltPath;
        this.beltPaths.dirty = true;
        // TODO remove belt entities
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

    update() {

        if(this.beltPaths.dirty) {
            this.beltPaths.activeArray = [];
            for(let i = 0; i < this.beltPaths.active.size; ++i){
                // TODO test if this is faster than Array.from
                // TODO investigate if iterating through array first would be faster
                this.beltPaths.activeArray.push(this.beltPaths.active.keys()[i])
            }
            this.beltPaths.dirty = false;
        }



    }

    



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
