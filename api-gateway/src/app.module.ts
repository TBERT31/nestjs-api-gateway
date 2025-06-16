import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppService } from './app.service';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { CacheableMemory } from 'cacheable';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';

const redisOptions = {
  url: 'redis://localhost:6379', // L'URL du serveur Redis (utiliser 'rediss' pour TLS)
  //password: 'your_password', // Mot de passe optionnel si Redis a l'authentification activée

  socket: {
    host: 'localhost', // Nom d'hôte du serveur Redis
    port: 6379,         // Numéro de port
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000), // Logique de reconnexion personnalisée
    
    tls: false, // Activer TLS si vous avez besoin de vous connecter via SSL
    keepAlive: 1000, // Délai keep-alive (en millisecondes)
  }
};


@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'SERVICE_A',
        transport: Transport.TCP,
        options: {
          host: '127.0.0.1',
          port: 8888,
        },
      },
      {
        name: 'SERVICE_B',
        transport: Transport.TCP,
        options: {
          host: '127.0.0.1',
          port: 8889,
        },
      },
    ]),
    CacheModule.registerAsync({
      useFactory: async () => {
        return {
          ttl: 120,
          isGlobal: true,
          stores: [
            new Keyv({
              store: new CacheableMemory({          
                ttl: 60,
                lruSize: 5000,
              }),
            }),
            new KeyvRedis(redisOptions),
          ],
        };
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,   
        limit: 20,    
      },
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100
      }
    ]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { 
      provide: APP_INTERCEPTOR, 
      useClass: CacheInterceptor 
    }, 
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
  ],
})
export class AppModule {}