import { Injectable,  CanActivate,  ExecutionContext, UnauthorizedException, Logger } from "@nestjs/common"
import  { JwtService } from "@nestjs/jwt"
import  { ConfigService } from "@nestjs/config"
import  { CacheService } from "../../cache/cache.service"
import  { Request } from "express"

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name)

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    // Extraire le token depuis les cookies ou l'en-tête
    const token = this.extractTokenFromCookie(request) || this.extractTokenFromHeader(request)

    if (!token) {
      this.logger.warn("Aucun token trouvé dans les cookies ou en-têtes")
      throw new UnauthorizedException("Token d'accès manquant")
    }

    try {
      // Vérifier si le token est dans la blacklist
      const isBlacklisted = await this.cacheService.get(`blacklist_${token}`)
      if (isBlacklisted) {
        this.logger.warn("Token dans la blacklist")
        throw new UnauthorizedException("Token révoqué")
      }

      // Vérifier et décoder le token
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get("JWT_SECRET"),
      })

      // Ajouter le payload à l'objet request
      request["user"] = payload

      this.logger.debug(`Token valide pour l'utilisateur: ${payload.sub}`)
      return true
    } catch (error) {
      this.logger.error("Erreur de vérification du token:", error.message)

      if (error.name === "TokenExpiredError") {
        throw new UnauthorizedException("Token expiré")
      } else if (error.name === "JsonWebTokenError") {
        throw new UnauthorizedException("Token invalide")
      } else {
        throw new UnauthorizedException("Erreur d'authentification")
      }
    }
  }

  private extractTokenFromCookie(request: Request): string | undefined {
    // Vérifier les cookies avec différents noms possibles
    const token =
      request.cookies?.["accesstoken"] || request.cookies?.["access_token"] || request.cookies?.["Authorization"]

    if (token) {
      this.logger.debug("Token trouvé dans les cookies")
    }

    return token
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization
    if (!authHeader) return undefined

    const [type, token] = authHeader.split(" ")
    if (type === "Bearer" && token) {
      this.logger.debug("Token trouvé dans l'en-tête Authorization")
      return token
    }

    return undefined
  }
}
