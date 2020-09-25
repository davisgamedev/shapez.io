import { GameSystem } from "../game_system";

export class SystemUpdateResolver extends GameSystem {
    constructor(root) {
        super(root);

        this.reporter = null;
        this.requireReporterOnProvide = [];
    }

    provideReporter(reporter) {
        this.reporter = reporter;
        for (let i = 0; i < this.requireReporterOnProvide.length; ++i) {
            this.requireReporterOnProvide[i].acceptSystemUpdateReporter(this.reporter);
        }
    }

    requireReporter(system) {
        if (!this.reporter) {
            this.requireReporterOnProvide.push(system);
        } else system.acceptSystemUpdateReporter(this.reporter);
        system.registeredReporter = true;
    }

    tryProvideEntities(system) {
        for (let i = system.requiredComponentIds.length - 1; i >= 0; --i) {
            if (this.reporter.requiredComponentIds.indexOf(system.requiredComponentIds[i]) >= 0) {
                this.reporter.acceptEntities(system.getUpdatedEntitiesArray());
                return;
            }
        }
    }
}
