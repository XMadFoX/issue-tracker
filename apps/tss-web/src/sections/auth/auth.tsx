import { Button } from "@prism/ui/components/button";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { revalidateLogic } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import z from "zod";
import { signIn, signUp, useSession } from "@/lib/auth";

const signInSchema = z.object({
	email: z.email("Enter a valid email address."),
	password: z.string().min(8, "Password must be at least 8 characters."),
});

const signUpSchema = signInSchema.extend({
	name: z.string().trim().min(1, "Enter your name."),
});

export const modeSchema = z.enum(["signin", "signup"]);
type AuthMode = z.infer<typeof modeSchema>;

type AuthFormProps = {
	initialEmail?: string;
	inviteToken?: string;
};

function useAuthRedirect(inviteToken?: string) {
	const navigate = useNavigate();

	return useCallback(() => {
		if (inviteToken) {
			return navigate({
				to: "/invite/$token",
				params: { token: inviteToken },
			});
		}
		return navigate({ to: "/" });
	}, [inviteToken, navigate]);
}

function focusFirstInvalidField(form: HTMLFormElement | null) {
	// Wait for aria-invalid and the error descriptions to reach the DOM.
	requestAnimationFrame(() => {
		form
			?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')
			?.focus();
	});
}

function AuthFormFeedback({
	hasValidationErrors,
	serverError,
}: {
	hasValidationErrors: boolean;
	serverError?: string;
}) {
	return (
		<div role="alert" aria-atomic="true">
			{hasValidationErrors && (
				<p className="text-destructive text-sm">
					Please correct the highlighted fields.
				</p>
			)}
			{serverError && <p className="text-destructive text-sm">{serverError}</p>}
		</div>
	);
}

export default function AuthForm({
	initialEmail,
	initialMode,
	inviteToken,
}: AuthFormProps & { initialMode?: AuthMode }) {
	const [mode, setMode] = useState<AuthMode>(initialMode ?? "signin");
	const isSignUp = mode === "signup";
	const session = useSession();
	const redirect = useAuthRedirect(inviteToken);

	useEffect(() => {
		if (session.isPending || !session.data?.user) return;
		void redirect();
	}, [redirect, session.isPending, session.data?.user]);

	return (
		<div className="flex flex-col">
			{isSignUp ? (
				<SignUpForm initialEmail={initialEmail} inviteToken={inviteToken} />
			) : (
				<SignInForm initialEmail={initialEmail} inviteToken={inviteToken} />
			)}
			<div className="h-px bg-muted/50 my-3 w-full" />
			<div className="text-center text-sm text-muted-foreground">
				{isSignUp ? "Already have an account? " : "Don't have an account? "}
				<Button
					variant="link"
					type="button"
					className="p-0 h-auto"
					onClick={() => setMode(isSignUp ? "signin" : "signup")}
				>
					{isSignUp ? "Sign in" : "Sign up"}
				</Button>
			</div>
		</div>
	);
}

export function SignInForm({ initialEmail, inviteToken }: AuthFormProps) {
	const redirect = useAuthRedirect(inviteToken);
	const formRef = useRef<HTMLFormElement>(null);
	const [serverError, setServerError] = useState<string>();
	const form = useAppForm({
		defaultValues: {
			email: initialEmail ?? "",
			password: "",
		},
		validationLogic: revalidateLogic(),
		validators: { onDynamic: signInSchema },
		onSubmitInvalid: () => focusFirstInvalidField(formRef.current),
		onSubmit: async ({ value }) => {
			try {
				const res = await signIn.email(value);
				if (res.error) {
					setServerError(
						res.error.message ?? "Unable to authenticate. Try again.",
					);
					return;
				}
				void redirect();
			} catch {
				setServerError("Unable to authenticate. Try again.");
			}
		},
	});

	return (
		<form
			ref={formRef}
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				setServerError(undefined);
				void form.handleSubmit();
			}}
			className="flex flex-col gap-4"
		>
			<form.AppField name="email">
				{(field) => (
					<field.Input
						label="Email"
						type="email"
						autoComplete="username"
						announceErrors={false}
					/>
				)}
			</form.AppField>
			<form.AppField name="password">
				{(field) => (
					<field.Input
						label="Password"
						type="password"
						autoComplete="current-password"
						announceErrors={false}
					/>
				)}
			</form.AppField>
			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(isSubmitting) => (
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Signing in..." : "Sign In"}
					</Button>
				)}
			</form.Subscribe>
			<form.Subscribe
				selector={(state) =>
					state.submissionAttempts > 0 && !state.isFieldsValid
				}
			>
				{(hasValidationErrors) => (
					<AuthFormFeedback
						hasValidationErrors={hasValidationErrors}
						serverError={serverError}
					/>
				)}
			</form.Subscribe>
		</form>
	);
}

export function SignUpForm({ initialEmail, inviteToken }: AuthFormProps) {
	const redirect = useAuthRedirect(inviteToken);
	const formRef = useRef<HTMLFormElement>(null);
	const [serverError, setServerError] = useState<string>();
	const form = useAppForm({
		defaultValues: {
			name: "",
			email: initialEmail ?? "",
			password: "",
		},
		validationLogic: revalidateLogic(),
		validators: { onDynamic: signUpSchema },
		onSubmitInvalid: () => focusFirstInvalidField(formRef.current),
		onSubmit: async ({ value }) => {
			try {
				const res = await signUp.email({ ...value, name: value.name.trim() });
				if (res.error) {
					setServerError(
						res.error.message ?? "Unable to authenticate. Try again.",
					);
					return;
				}
				void redirect();
			} catch {
				setServerError("Unable to authenticate. Try again.");
			}
		},
	});

	return (
		<form
			ref={formRef}
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				setServerError(undefined);
				void form.handleSubmit();
			}}
			className="flex flex-col gap-4"
		>
			<form.AppField name="email">
				{(field) => (
					<field.Input
						label="Email"
						type="email"
						autoComplete="username"
						announceErrors={false}
					/>
				)}
			</form.AppField>
			<form.AppField name="name">
				{(field) => (
					<field.Input
						label="Name"
						autoComplete="name"
						announceErrors={false}
					/>
				)}
			</form.AppField>
			<form.AppField name="password">
				{(field) => (
					<field.Input
						label="Password"
						type="password"
						autoComplete="new-password"
						description="Use at least 8 characters."
						announceErrors={false}
					/>
				)}
			</form.AppField>
			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(isSubmitting) => (
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Creating account..." : "Sign Up"}
					</Button>
				)}
			</form.Subscribe>
			<form.Subscribe
				selector={(state) =>
					state.submissionAttempts > 0 && !state.isFieldsValid
				}
			>
				{(hasValidationErrors) => (
					<AuthFormFeedback
						hasValidationErrors={hasValidationErrors}
						serverError={serverError}
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
