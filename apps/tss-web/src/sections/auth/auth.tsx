import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { useState } from "react";
import { signIn, signUp } from "src/lib/auth";
import z from "zod";

const schema = z.object({
	email: z.email(),
	password: z.string().min(8),
});

const signUpSchema = schema.extend({
	name: z.string().min(1),
});

export default function AuthForm() {
	const [mode, setMode] = useState<"login" | "register">("login");

	return (
		<div className="flex flex-col gap-">
			{mode === "login" ? <SignInForm /> : <SignUpForm />}
			<div className="h-px bg-muted/50 my-3 w-full" />
			<div className="text-center text-sm text-muted-foreground">
				{mode === "login"
					? "Don't have an account? "
					: "Already have an account? "}
				<Button
					variant="link"
					type="button"
					className="p-0 h-auto"
					onClick={() => setMode(mode === "login" ? "register" : "login")}
				>
					{mode === "login" ? "Sign up" : "Sign in"}
				</Button>
			</div>
		</div>
	);
}
export function SignInForm() {
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
