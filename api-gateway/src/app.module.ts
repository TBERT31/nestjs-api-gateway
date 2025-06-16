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
import axiosRetry from 'axios-retry';
import axios from 'axios';

const redisOptions = {
  url: 'redis://localhost:6379', // The Redis server URL (use 'rediss' for TLS)
  //password: 'your_password', // Optional password if Redis has authentication enabled

  socket: {
    host: 'localhost', // Hostname of the Redis server
    port: 6379,        // Port number
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000), // Custom reconnect logic
    
    tls: false, // Enable TLS if you need to connect over SSL
    keepAlive: 1000, // Keep-alive timeout (in milliseconds)
  }
};

axiosRetry(axios, { retries: 3 });

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
    HttpModule.registerAsync({
      useFactory: async () => ({

      }),
    })
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