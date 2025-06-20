import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Get,
  Query,
  Res,
  UnauthorizedException,
} from "@nestjs/common"
import  { AuthService } from "./auth.service"
import  { RegisterDto } from "./dto/register.dto"
import  { LoginDto } from "./dto/login.dto"
import  { ForgotPasswordDto } from "./dto/forgot-password.dto"
import  { ResetPasswordDto } from "./dto/reset-password.dto"
import  { CreateUserDto } from "./dto/create-user.dto"
import { JwtAuthGuard } from "./guards/jwt-auth.guard"
import { RolesGuard } from "./guards/roles.guard"
import { Roles } from "./decorators/roles.decorator"
import { Role } from "../utils/enums/enums"
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger"
import  { VerifyPhoneDto } from "./dto/VerifyPhone.dto"
import  { UpdatePasswordDto } from "./dto/updatePassword.dto"
import  { UpdatePhoneDto } from "./dto/updatePhone.dto"
import  { ResendCodeDto } from "./dto/resendCodedto"
import  { Response } from "express"

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === "production"

    // Cookie pour l'access token
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
    })

    // Cookie pour le refresh token
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
      path: "/",
    })
  }

  private clearCookies(res: Response) {
    const isProduction = process.env.NODE_ENV === "production"

    res.clearCookie("accessToken", {
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
    })

    res.clearCookie("refreshToken", {
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
    })
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Inscription classique (Admin par défaut)' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post("verify-registration")
  async verifyRegistration(@Body() verifyPhoneDto: VerifyPhoneDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyPhoneAndRegister(verifyPhoneDto)

    // Définir les cookies avec les tokens
    this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken)

    return {
      user: result.user,
      message: "Inscription réussie",
    }
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Connexion classique" })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(loginDto)

    // Définir les cookies avec les tokens
    this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken)

    return {
      user: result.user,
      message: "Connexion réussie",
      accesstoken:result.tokens.accessToken,
    }
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rafraîchir le token d'accès" })
  async refreshToken(@Request() req, @Res({ passthrough: true }) res: Response) {
    // Extraire le refresh token depuis les cookies
    const refreshToken = req.cookies?.["refreshToken"]

    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token manquant")
    }

    const result = await this.authService.refreshToken({ refreshToken })

    // Définir les nouveaux cookies
    this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken)

    return {
      message: "Tokens rafraîchis avec succès",
    }
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Déconnexion" })
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    // Extraire le token depuis les cookies ou l'en-tête
    const token = req.cookies?.["accessToken"] || req.headers.authorization?.replace("Bearer ", "")
    const userId = req.user.sub

    const result = await this.authService.logout(token, userId)

    // Supprimer les cookies
    this.clearCookies(res)

    return result
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir le profil utilisateur' })
  getProfile(@Request() req) {
    return {
      user: req.user,
      message: 'Profil récupéré avec succès'
    };
  }

  @Post("create-user")
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Création d'utilisateur par un admin" })
  async createUser(@Body() createUserDto: CreateUserDto, @Request() req) {
    return this.authService.createUser(createUserDto, req.user.sub)
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demande de réinitialisation de mot de passe (Admin uniquement)' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe avec le code de vérification' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post("update-password")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Changer le mot de passe connecté" })
  async updatePassword(@Body() updatePasswordDto: UpdatePasswordDto, @Request() req) {
    return this.authService.updatePassword(req.user.sub, updatePasswordDto)
  }

  @Post("update-phone")
  @UseGuards(JwtAuthGuard)
  async updatePhoneNumber(@Body() updatePhoneDto: UpdatePhoneDto, @Request() req) {
    return this.authService.updatePhoneNumber(req.user.sub, updatePhoneDto)
  }

  @Post("verify-phone-update")
  @UseGuards(JwtAuthGuard)
  async verifyPhoneUpdate(@Body() verifyPhoneDto: VerifyPhoneDto, @Request() req) {
    return this.authService.verifyAndUpdatePhone(req.user.sub, verifyPhoneDto)
  }

  @Post('resend-code')
  @ApiOperation({ summary: 'Renvoyer un code de vérification' })
  async resendCode(@Body() resendCodeDto: ResendCodeDto) {
    return this.authService.resendVerificationCode(
      resendCodeDto.phone,
      resendCodeDto.type,
      resendCodeDto.userId
    );
  }

  @Post("resend-phone-update-code")
  @UseGuards(JwtAuthGuard)
  async resendPhoneUpdateCode(@Body() body: { phone: string }, @Request() req) {
    return this.authService.resendVerificationCode(body.phone, "phone_update", req.user.sub)
  }

  // Routes Google OAuth
  @Get('google/login')
  @ApiOperation({ summary: 'Initier la connexion Google (Admins)' })
  async googleLogin(@Res() res: Response) {
    const authUrl = this.authService.getGoogleAuthUrl();
    return res.redirect(authUrl);
  }

  @Get('google/employee-login')
  @ApiOperation({ summary: 'Initier la connexion Google (Employés)' })
  async googleEmployeeLogin(@Res() res: Response) {
    const authUrl = this.authService.getGoogleEmployeeAuthUrl();
    return res.redirect(authUrl);
  }

  @Get("google/callback")
  @ApiOperation({ summary: "Callback Google OAuth (Admins)" })
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const result = await this.authService.googleCallback(code, state)

      this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken)

      const frontendUrl = `${process.env.FRONTEND_URL}/dashboard?auth=success`
      return res.redirect(frontendUrl)
    } catch (error) {
      const errorUrl = `${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error.message)}`
      return res.redirect(errorUrl)
    }
  }

  @Get("google/employee/callback")
  @ApiOperation({ summary: "Callback Google OAuth (Employés)" })
  async googleEmployeeCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const result = await this.authService.googleEmployeeCallback(code, state)

      this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken)

      const frontendUrl = `${process.env.FRONTEND_URL}/employee/dashboard?auth=success`
      return res.redirect(frontendUrl)
    } catch (error) {
      const errorUrl = `${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error.message)}`
      return res.redirect(errorUrl)
    }
  }
}
