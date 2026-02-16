import { app, initApp } from "../server/index";

export default async function handler(req: any, res: any) {
    await initApp();
    return app(req, res);
}
