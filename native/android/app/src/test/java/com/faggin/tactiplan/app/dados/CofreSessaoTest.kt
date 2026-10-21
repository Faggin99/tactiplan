package com.faggin.tactiplan.app.dados

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.aead.PredefinedAeadParameters
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// A cifra de verdade (Tink AES-256-GCM) rodando na JVM, sem o Keystore.
class CofreSessaoTest {
    private val armazem = ArmazemMemoria()

    private fun aead(): Aead {
        AeadConfig.register()
        return KeysetHandle.generateNew(PredefinedAeadParameters.AES256_GCM)
            .getPrimitive(RegistryConfiguration.get(), Aead::class.java)
    }

    private val sessao = Sessao("tpa_segredo", "2027-01-01T00:00:00.000Z", meReal(), Escolha("w", "c"), 1L)

    @Test fun `salva e le de volta, e o que vai pro armazem esta cifrado`() {
        val cofre = CofreSessaoCifrado(armazem, CifraTink(aead()))
        assertNull(cofre.ler())
        cofre.salvar(sessao)
        assertEquals(sessao, cofre.ler())
        val gravado = armazem.ler(CofreSessaoCifrado.CHAVE)!!
        assertFalse(gravado.contains("tpa_segredo"))
        assertFalse(gravado.contains("teste.app.t0"))
    }

    @Test fun `limpar apaga a sessao mas guarda a ultima escolha da pessoa`() {
        val cofre = CofreSessaoCifrado(armazem, CifraTink(aead()))
        cofre.salvar(sessao)
        cofre.guardarUltimaEscolha("u1", Escolha("w", "c"))
        cofre.limpar()
        assertNull(cofre.ler())
        assertEquals(Escolha("w", "c"), cofre.lerUltimaEscolha("u1"))
        assertNull(cofre.lerUltimaEscolha("outra"))
    }

    @Test fun `blob de outra chave le como null`() {
        CofreSessaoCifrado(armazem, CifraTink(aead())).salvar(sessao)
        assertNull(CofreSessaoCifrado(armazem, CifraTink(aead())).ler())
    }

    @Test fun `montarCofre - falha uma vez apaga e tenta de novo, falha duas cai na memoria`() {
        var tentativas = 0
        var apagou = false
        val c1 = montarCofre({ tentativas++; if (tentativas == 1) error("keystore") else CifraTink(aead()) }, { apagou = true }, armazem)
        assertTrue(c1 is CofreSessaoCifrado)
        assertTrue(apagou)
        val c2 = montarCofre({ error("sempre") }, {}, armazem)
        assertTrue(c2 is CofreSessaoMemoria)
        c2.salvar(sessao)
        assertEquals(sessao, c2.ler())
    }

    @Test fun `trava - liga ao abrir, carencia de um minuto e desligar destrava`() {
        var t = TravaApp.aoAbrir(true)
        assertTrue(t.bloqueada)
        t = t.desbloqueou().foiProFundo(0).voltou(30_000, true)
        assertFalse(t.bloqueada)
        t = t.foiProFundo(0).voltou(CARENCIA_BIOMETRIA_MS, true)
        assertTrue(t.bloqueada)
        assertFalse(t.mudouOpcao(false).bloqueada)
        gravarBiometria(armazem, true)
        assertTrue(biometriaLigada(armazem))
        gravarBiometria(armazem, false)
        assertFalse(biometriaLigada(armazem))
    }
}
