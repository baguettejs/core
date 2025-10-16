export const ControllerRegistry: any[] = [];

export function registerController(controller: any) {
    ControllerRegistry.push(controller);
}