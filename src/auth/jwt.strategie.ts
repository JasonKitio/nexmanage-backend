import { Injectable, UnauthorizedException } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import  { ConfigService } from "@nestjs/config"
import  { UsersService } from "../User/user.service"

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
   super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET')

    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub)
    if (!user || !user.isActif) {
      throw new UnauthorizedException()
    }
    return { userId: payload.sub, phone: payload.phone, role: payload.role }
  }
}
