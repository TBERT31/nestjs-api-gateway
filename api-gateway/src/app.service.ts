import { HttpService } from '@nestjs/axios';
import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AxiosError } from 'axios';
import { firstValueFrom, throwError, timer } from 'rxjs';
import { catchError, map, repeat, retry, tap } from 'rxjs/operators';
import { httpRetryOperator } from './common/operators/http-retry.operator';
import { tcpRetryOperator } from './common/operators/tcp-retry.operator';

@Injectable()
export class AppService {
  constructor(
    @Inject('SERVICE_A') private readonly clientServiceA: ClientProxy,
    @Inject('SERVICE_B') private readonly clientServiceB: ClientProxy,
    private readonly httpService: HttpService,
  ) {}

  pingServiceA() {
    const serviceName = 'SERVICE_A';
    const retries = 3; 
    const startTs = Date.now();
    const pattern = { cmd: 'ping' };
    const payload = {};
    return this.clientServiceA
      .send<string>(pattern, payload)
      .pipe(
        tcpRetryOperator(`${serviceName}:${pattern.cmd}`, retries),
        map((message: string) => ({ message, duration: Date.now() - startTs })),
      );
  }

  pingServiceB() {
    const serviceName = 'SERVICE_B';
    const retries = 3; 
    const startTs = Date.now();
    const pattern = { cmd: 'ping' };
    const payload = {};
    return this.clientServiceB
      .send<string>(pattern, payload)
      .pipe(
        tcpRetryOperator(`${serviceName}:${pattern.cmd}`, retries),
        map((message: string) => ({ message, duration: Date.now() - startTs })),
      );
  }

  pingHttpService() {
    const serviceUrl = 'http://localhost:7002/ping-http';
    const retries = 5; 

    return this.httpService.get(serviceUrl).pipe(
      httpRetryOperator(serviceUrl, retries) 
    );
  }
}