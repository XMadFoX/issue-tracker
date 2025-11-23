import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signIn, signUp, useSession } from "src/lib/auth";
import z from "zod";

const schema = z.object({
	email: z.email(),
	password: z.string().min(8),
});

const signUpSchema = schema.extend({
	name: z.string().min(1),
});

export const modeSchema = z.enum(["signin", "signup"]);
type AuthMode = z.infer<typeof modeSchema>;

export default function AuthForm({ initialMode }: { initialMode?: AuthMode }) {
	const [mode, setMode] = useState<AuthMode>(initialMode || "signin");
	const session = useSession();
	const navigate = useNavigate();

	useEffect(() => {
		if (!session.isPending && !session.data?.user) {
			navigate({ to: "/auth" });
		}
	}, [session, navigate]);

	return (
		<div className="flex flex-col gap-">
			{mode === "signin" ? <SignInForm /> : <SignUpForm />}
			<div className="h-px bg-muted/50 my-3 w-full" />
			<div className="text-center text-sm text-muted-foreground">
				{mode === "signin"
					? "Don't have an account? "
					: "Already have an account? "}
				<Button
					variant="link"
					type="button"
					className="p-0 h-auto"
					onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
				>
					{mode === "signin" ? "Sign up" : "Sign in"}
				</Button>
			</div>
		</div>
	);
}
export function SignInForm() {
	const navigate = useNavigate();

	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
		},
		validators: {
			onSubmit: schema,
		},
		onSubmit: async ({ value: values }) => {
			const res = await signIn.email({ ...values });
			if (res.error) {
				const errMsg = res.error.message;
				form.setErrorMap({ onSubmit: { form: errMsg, fields: {} } });
				return { form: errMsg };
			}
			navigate({ to: "/" });
		},
	});

	return (
		<div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="flex flex-col gap-4"
			>
				<form.AppField name="email">
					{(field) => <field.Input label="Email" type="email" />}
				</form.AppField>
				<form.AppField name="password">
					{(field) => <field.Input label="Password" type="password" />}
				</form.AppField>
				<Button type="submit">Sign In</Button>
				<form.Subscribe selector={(state) => [state.errorMap]}>
					{([errorMap]) =>
						errorMap.onSubmit ? (
							<FieldError className="form-error">
								{errorMap.onSubmit.toString()}
							</FieldError>
						) : null
					}
				</form.Subscribe>
			</form>
		</div>
	);
}
export function SignUpForm() {
	const navigate = useNavigate();
	const form = useAppForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
		},
		validators: {
			onSubmit: signUpSchema,
		},
		onSubmit: async ({ value: values }) => {
			await signUp.email({ ...values });
			navigate({ to: "/" });
		},
	});

	return (
		<div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
				className="flex flex-col gap-4"
			>
				<form.AppField name="email">
					{(field) => <field.Input label="Email" type="email" />}
				</form.AppField>
				<form.AppField name="name">
					{(field) => <field.Input label="Name" />}
				</form.AppField>
				<form.AppField name="password">
					{(field) => <field.Input label="Password" type="password" />}
				</form.AppField>
				<Button type="submit">Sign Up</Button>
			</form>
		</div>
	);
}
