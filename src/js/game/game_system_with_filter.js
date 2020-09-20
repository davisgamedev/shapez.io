/* typehints:start */
import { Component } from "./component";
import { Entity } from "./entity";
/* typehints:end */

import { GameRoot } from "./root";
import { GameSystem } from "./game_system";
import { arrayDelete, arrayDeleteValue, fastArrayDelete } from "../core/utils";

// TODO check indexOf and other O(n) operations in loops

/**
 * @typedef {number} EntityUid
 */

export class GameSystemWithFilter extends GameSystem {
    /**
     * Constructs a new game system with the given component filter. It will process
     * all entities which have *all* of the passed components
     * @param {GameRoot} root
     * @param {Array<typeof Component>} requiredComponents
     */
    constructor(root, requiredComponents) {
        super(root);
        this.requiredComponents = requiredComponents;
        this.requiredComponentIds = requiredComponents.map(component => component.getId());

        this.allEntitiesSet = new Set();
        this.allEntitiesAsArray = [];
        this.allEntitiesOutdated = true;

        this.root.signals.entityAdded.add(this.internalPushEntityIfMatching, this);
        this.root.signals.entityGotNewComponent.add(this.internalReconsiderEntityToAdd, this);
        this.root.signals.entityComponentRemoved.add(this.internalCheckEntityAfterComponentRemoval, this);
        this.root.signals.entityQueuedForDestroy.add(this.internalPopEntityIfMatching, this);

        this.root.signals.postLoadHook.add(this.internalPostLoadHook, this);
        this.root.signals.bulkOperationFinished.add(this.refreshCaches, this);

        this.reporter = null;
    }

    acceptSystemUpdateResolver(resolver) {
        super.acceptSystemUpdateResolver(resolver);
        resolver.requireReporter(this);
    }

    acceptSystemUpdateReporter(reporter) {
        this.reporter = reporter;
    }

    getUpdatedEntitiesArray() {
        if (this.allEntitiesOutdated) {
            return [...this.allEntitiesSet];
        } else {
            return this.allEntitiesAsArray;
        }
    }

    /**
     * @param {Entity} entity
     */
    internalPushEntityIfMatching(entity) {
        if (this.allEntitiesSet.has(entity)) return;
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (entity.components[this.requiredComponentIds[i]]) {
                this.internalRegisterEntity(entity);
                return;
            }
        }
    }

    // TODO double check we are clearing both Map and Keys!!!!!!
    /**
     *
     * @param {Entity} entity
     */
    internalCheckEntityAfterComponentRemoval(entity) {
        if (this.allEntitiesSet.has(entity.uid)) {
            // Entity wasn't interesting anyways
            return;
        }

        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) {
                this.allEntitiesSet.delete(entity);
            }
        }
    }

    /**
     *
     * @param {Entity} entity
     */
    internalReconsiderEntityToAdd(entity) {
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) {
                return;
            }
        }
        if (this.allEntitiesSet.delete(entity)) {
            return;
        }
        this.internalRegisterEntity(entity);
    }

    refreshCaches() {
        // Remove all entities which are queued for destroy
        for (let it = this.allEntitiesSet.values(), entity = null; (entity = it.next().value); ) {
            if (entity.queuedForDestroy || entity.destroyed) {
                this.allEntitiesSet.delete(entity);
            }
        }
        this.allEntitiesAsArray = [...this.allEntitiesSet];
        this.allEntitiesOutdated = false;
    }

    /**
     * Recomputes all target entities after the game has loaded
     */
    internalPostLoadHook() {
        this.refreshCaches();
    }

    /**
     *
     * @param {Entity} entity
     */
    internalRegisterEntity(entity) {
        this.allEntitiesSet.add(entity);

        if (this.root.gameInitialized && !this.root.bulkOperationRunning) {
            // Sort entities by uid so behaviour is predictable
            this.allEntitiesSet = new Set([...this.allEntitiesSet].sort((a, b) => a - b));
        }
    }

    /**
     *
     * @param {Entity} entity
     */
    internalPopEntityIfMatching(entity) {
        if (this.root.bulkOperationRunning) {
            // We do this in refreshCaches afterwards
            return;
        }
        this.allEntitiesSet.delete(entity);
    }
}
