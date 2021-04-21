/* typehints:start */
import { GameRoot } from "./root";
/* typehints:end */

import { createLogger } from "../core/logging";
import { BeltSystem } from "./systems/belt";
import { ItemEjectorSystem } from "./systems/item_ejector";
import { MapResourcesSystem } from "./systems/map_resources";
import { MinerSystem } from "./systems/miner";
import { ItemProcessorSystem } from "./systems/item_processor";
import { UndergroundBeltSystem } from "./systems/underground_belt";
import { HubSystem } from "./systems/hub";
import { StaticMapEntitySystem } from "./systems/static_map_entity";
import { ItemAcceptorSystem } from "./systems/item_acceptor";
import { StorageSystem } from "./systems/storage";
import { WiredPinsSystem } from "./systems/wired_pins";
import { BeltUnderlaysSystem } from "./systems/belt_underlays";
import { WireSystem } from "./systems/wire";
import { ConstantSignalSystem } from "./systems/constant_signal";
import { LogicGateSystem } from "./systems/logic_gate";
import { LeverSystem } from "./systems/lever";
import { DisplaySystem } from "./systems/display";
import { ItemProcessorOverlaysSystem } from "./systems/item_processor_overlays";
import { BeltReaderSystem } from "./systems/belt_reader";
import { FilterSystem } from "./systems/filter";
import { ItemProducerSystem } from "./systems/item_producer";

const logger = createLogger("game_system_manager");

export class GameSystemManager {
    /**
     *
     * @param {GameRoot} root
     */
    constructor(root) {
        this.root = root;

        /**
         * ! Adding systems has now changed:
         * !
         * !  - in addition to adding in the class in systems and in initSystems
         * !    a method must be created in the body of this class
         * !
         * !  - this is to allow debug performance tools to read what system is
         * !    specifically being called during its update() --critical when finding bottlenecks--
         * !
         * !  - these will only be used during debug to prevent extra overhead in production
         */
        this.systems = {
            /* typehints:start */
            /** @type {BeltSystem} */
            belt: null,

            /** @type {ItemEjectorSystem} */
            itemEjector: null,

            /** @type {MapResourcesSystem} */
            mapResources: null,

            /** @type {MinerSystem} */
            miner: null,

            /** @type {ItemProcessorSystem} */
            itemProcessor: null,

            /** @type {UndergroundBeltSystem} */
            undergroundBelt: null,

            /** @type {HubSystem} */
            hub: null,

            /** @type {StaticMapEntitySystem} */
            staticMapEntities: null,

            /** @type {ItemAcceptorSystem} */
            itemAcceptor: null,

            /** @type {StorageSystem} */
            storage: null,

            /** @type {WiredPinsSystem} */
            wiredPins: null,

            /** @type {BeltUnderlaysSystem} */
            beltUnderlays: null,

            /** @type {WireSystem} */
            wire: null,

            /** @type {ConstantSignalSystem} */
            constantSignal: null,

            /** @type {LogicGateSystem} */
            logicGate: null,

            /** @type {LeverSystem} */
            lever: null,

            /** @type {DisplaySystem} */
            display: null,

            /** @type {ItemProcessorOverlaysSystem} */
            itemProcessorOverlays: null,

            /** @type {BeltReaderSystem} */
            beltReader: null,

            /** @type {FilterSystem} */
            filter: null,

            /** @type {ItemProducerSystem} */
            itemProducer: null,

            /* typehints:end */
        };

        this.systemUpdateOrder = [];

        this.internalInitSystems();
    }

    async beltUpdate(id, system) {
        await system.update.call(system);
    }
    async itemEjectorUpdate(id, system) {
        await system.update.call(system);
    }
    async mapResourcesUpdate(id, system) {
        await system.update.call(system);
    }
    async minerUpdate(id, system) {
        await system.update.call(system);
    }
    async itemProcessorUpdate(id, system) {
        await system.update.call(system);
    }
    async undergroundBeltUpdate(id, system) {
        await system.update.call(system);
    }
    async hubUpdate(id, system) {
        await system.update.call(system);
    }
    async staticMapEntitiesUpdate(id, system) {
        await system.update.call(system);
    }
    async itemAcceptorUpdate(id, system) {
        await system.update.call(system);
    }
    async storageUpdate(id, system) {
        await system.update.call(system);
    }
    async wiredPinsUpdate(id, system) {
        await system.update.call(system);
    }
    async beltUnderlaysUpdate(id, system) {
        await system.update.call(system);
    }
    async wireUpdate(id, system) {
        await system.update.call(system);
    }
    async constantSignalUpdate(id, system) {
        await system.update.call(system);
    }
    async logicGateUpdate(id, system) {
        await system.update.call(system);
    }
    async leverUpdate(id, system) {
        await system.update.call(system);
    }
    async displayUpdate(id, system) {
        await system.update.call(system);
    }
    async itemProcessorOverlaysUpdate(id, system) {
        await system.update.call(system);
    }
    async beltReaderUpdate(id, system) {
        await system.update.call(system);
    }
    async filterUpdate(id, system) {
        await system.update.call(system);
    }
    async itemProducerUpdate(id, system) {
        await system.update.call(system);
    }

    /**
     * Initializes all systems
     */
    internalInitSystems() {
        const add = (id, systemClass) => {
            const system = new systemClass(this.root);
            this.systems[id] = system;
            this.systemUpdateOrder.push(id);
        };

        // Order is important!
        //  - lol don't @me about these being async now
        //  - haven't seen too many issues so far
        // TODO: fix async handling errors about order mismatching

        // IMPORTANT: Item acceptor must be before the belt, because it may not tick after the belt
        // has put in the item into the acceptor animation, otherwise its off
        add("itemAcceptor", ItemAcceptorSystem);

        add("belt", BeltSystem);

        add("undergroundBelt", UndergroundBeltSystem);

        add("miner", MinerSystem);

        add("storage", StorageSystem);

        add("itemProcessor", ItemProcessorSystem);

        add("filter", FilterSystem);

        add("itemProducer", ItemProducerSystem);

        add("itemEjector", ItemEjectorSystem);

        add("mapResources", MapResourcesSystem);

        add("hub", HubSystem);

        add("staticMapEntities", StaticMapEntitySystem);

        add("wiredPins", WiredPinsSystem);

        add("beltUnderlays", BeltUnderlaysSystem);

        add("constantSignal", ConstantSignalSystem);

        // WIRES section
        add("lever", LeverSystem);

        // Wires must be before all gate, signal etc logic!
        add("wire", WireSystem);

        // IMPORTANT: We have 2 phases: In phase 1 we compute the output values of all gates,
        // processors etc. In phase 2 we propagate it through the wires network
        add("logicGate", LogicGateSystem);
        add("beltReader", BeltReaderSystem);

        add("display", DisplaySystem);

        add("itemProcessorOverlays", ItemProcessorOverlaysSystem);

        logger.log("📦 There are", this.systemUpdateOrder.length, "game systems");
    }

    /**
     * Updates all systems
     */

    async update() {
        await Promise.all(
            Object.entries(this.systems).map(
                ([key, system]) =>
                    new Promise((resolve, reject) => {
                        Promise.resolve(1).then(async () => {
                            if (G_IS_DEV) {
                                await this[key + "Update"](key, system);
                            } else {
                                await system.update();
                            }
                            resolve();
                        });
                    })
            )
        );

        // for (let i = 0; i < this.systemUpdateOrder.length; ++i) {
        //     const system = this.systems[this.systemUpdateOrder[i]];
        //     if (G_IS_DEV) {
        //         await this[key + "Update"](key, system);
        //     } else {
        //         await system.update();
        //     }
        // }
    }

    async refreshCaches() {
        if (window.doMultiThread) {
            await Promise.all(
                Object.values(this.systems).map(
                    s =>
                        new Promise(async (resolve, reject) => {
                            await s.refreshCaches();
                            resolve();
                        })
                )
            );
        } else {
            for (let i = 0; i < this.systemUpdateOrder.length; ++i) {
                const system = this.systems[this.systemUpdateOrder[i]];
                system.refreshCaches();
            }
        }
    }
}
