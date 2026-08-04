extern crate self as dlp;
pub use ::solana_program;

pub mod compat;

pub mod args;
pub mod consts;

pub mod discriminator;
pub mod pda;

#[cfg(feature = "cpi")]
pub mod cpi;

#[cfg(feature = "instruction")]
pub mod instruction_builder;

#[cfg(feature = "encryption")]
pub mod decrypt;

#[cfg(feature = "encryption")]
pub mod encrypt;

#[cfg(feature = "encryption")]
pub mod encryption;

#[cfg(feature = "encryption")]
pub use decrypt::*;

compat::declare_id!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
