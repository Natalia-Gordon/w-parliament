import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { CONTENT_READER } from './core/content-reader';
import { readContentFromDisk } from './core/content-reader.server';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes)), { provide: CONTENT_READER, useValue: readContentFromDisk }],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
