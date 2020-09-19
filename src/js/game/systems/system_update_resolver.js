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
    }
}
