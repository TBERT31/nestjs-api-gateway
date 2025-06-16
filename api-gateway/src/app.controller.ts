import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import { zip } from "rxjs";
import { map } from "rxjs/operators";
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';

@Controller()
@UseInterceptors(CacheInterceptor)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/ping-a')
  pingServiceA() {
    return this.appService.pingServiceA();
  }

  @Get('/ping-b')
  pingServiceB() {
    return this.appService.pingServiceB();
  }

  @Get("/ping-all")
  // @CacheKey('ping-all-combined-data') 
  // @CacheTTL(30000) 
  pingAll() {
    return zip(
      this.appService.pingServiceA(),
      this.appService.pingServiceB()
    ).pipe(
      map(([pongServiceA, pongServiceB]) => ({
        pongServiceA,
        pongServiceB
      }))
    );
  }

  @Get('/ping-http')
  // Vous pouvez ajouter des décorateurs de cache et de throttling ici aussi
  // @CacheKey('ping-http-data')
  // @CacheTTL(10000) // Par exemple, cacher cette réponse pendant 10 secondes
  // @Throttle('long') // Appliquer une règle de throttling spécifique
  pingHttp() {
    // Appelle la nouvelle méthode du service
    return this.appService.getMetrics();
  }
}