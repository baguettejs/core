export const ControllerRegistry: any[] = [];

export function registerController(controller: any) {
    if (!ControllerRegistry.includes(controller)) {
        ControllerRegistry.push(controller);
    }
}

export function getRegisteredControllers(): readonly any[] {
    return ControllerRegistry;
}
